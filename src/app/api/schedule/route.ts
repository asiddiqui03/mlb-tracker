import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId') || '147'; // 147 is NYY
  
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&season=2024&teamId=${teamId}`);
    if (!res.ok) throw new Error('Stats API fetch failed');
    const data = await res.json();
    
    let price = 1000;
    const timeSeries = [];
    
    let lastTime = 0;

    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        if (game.status.statusCode === 'F' && game.teams.away.score !== undefined && game.teams.home.score !== undefined) {
          const isHome = game.teams.home.team.id.toString() === teamId;
          const runsFor = isHome ? game.teams.home.score : game.teams.away.score;
          const runsAgainst = isHome ? game.teams.away.score : game.teams.home.score;
          
          const diff = runsFor - runsAgainst;
          const open = price;
          price += diff;
          const close = price;
          
          const high = open + runsFor;
          const low = open - runsAgainst;
          const volume = Math.max(1, runsFor + runsAgainst) * 1000000;
          
          // Use gameDate for precise timestamp to avoid duplicate date strings on double headers
          let unixTime = Math.floor(new Date(game.gameDate || game.officialDate).getTime() / 1000);
          
          // Ensure time is strictly monotonically increasing (Lightweight charts crashes otherwise)
          if (unixTime <= lastTime) {
              unixTime = lastTime + 3600; // Add an hour
          }
          lastTime = unixTime;

          timeSeries.push({
            time: unixTime,
            open,
            high,
            low,
            close,
            volume,
            isWin: diff > 0
          });
        }
      }
    }
    
    // Calculate Indicators
    let cumulativeVolume = 0;
    let cumulativeVolPrice = 0;
    
    let currentEMA50 = timeSeries[0]?.close || 1000;
    const emaAlpha = 2 / (50 + 1);

    const result = timeSeries.map((d, i) => {
      let sma200 = null;
      if (i >= 199) {
        let sum = 0;
        for (let j = 0; j < 200; j++) sum += timeSeries[i-j].close;
        sma200 = sum / 200;
      }

      if (i > 0) {
        currentEMA50 = (d.close - currentEMA50) * emaAlpha + currentEMA50;
      }

      const typicalPrice = (d.high + d.low + d.close) / 3;
      cumulativeVolume += d.volume;
      cumulativeVolPrice += typicalPrice * d.volume;
      const vwap = cumulativeVolume > 0 ? cumulativeVolPrice / cumulativeVolume : d.close;

      return {
        ...d,
        sma200: sma200 || d.close, 
        ema50: currentEMA50,
        vwap
      };
    });
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
