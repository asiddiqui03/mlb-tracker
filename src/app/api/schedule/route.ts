import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId') || '147'; // 147 is NYY
  
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&season=2022,2023,2024,2025,2026&teamId=${teamId}&gameType=R`);
    if (!res.ok) throw new Error('Stats API fetch failed');
    const data = await res.json();
    
    let price = 1000;
    const timeSeries: any[] = [];
    
    let lastTime = 0;

    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        const isLiveOrFinished = ['F', 'O', 'I', 'IR'].includes(game.status.statusCode);
        if (isLiveOrFinished && game.teams.away.score !== undefined && game.teams.home.score !== undefined) {
          const isHome = game.teams.home.team.id.toString() === teamId;
          const runsFor = isHome ? game.teams.home.score : game.teams.away.score;
          const runsAgainst = isHome ? game.teams.away.score : game.teams.home.score;
          
          const teamPitcherNode = isHome ? game.teams.home.probablePitcher : game.teams.away.probablePitcher;
          const oppPitcherNode = isHome ? game.teams.away.probablePitcher : game.teams.home.probablePitcher;
          const pitcher = teamPitcherNode?.fullName || 'TBD';
          const oppPitcher = oppPitcherNode?.fullName || 'TBD';
          const opponentId = isHome ? game.teams.away.team.id.toString() : game.teams.home.team.id.toString();

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
            isWin: diff > 0,
            pitcher,
            oppPitcher,
            opponentId
          });
        }
      }
    }
    
    let cumulativeVolume = 0;
    let cumulativeVolPrice = 0;
    
    const maPeriods = [9, 21, 50, 100, 150, 200];
    const currentEMAs: Record<number, number> = {};
    const emaAlphas: Record<number, number> = {};
    const firstClose = timeSeries[0]?.close || 1000;
    maPeriods.forEach(p => {
       currentEMAs[p] = firstClose;
       emaAlphas[p] = 2 / (p + 1);
    });

    let currentEMA12 = firstClose;
    const ema12Alpha = 2 / (12 + 1);

    let currentEMA26 = firstClose;
    const ema26Alpha = 2 / (26 + 1);

    let currentMacdSignal = 0; 
    const ema9Alpha = 2 / (9 + 1);

    // Variables for 14-period RSI
    let avgGain = 0;
    let avgLoss = 0;

    const result = timeSeries.map((d, i) => {
      const smas: Record<number, number | null> = {};
      maPeriods.forEach(p => {
          let sma = null;
          if (i >= p - 1) {
              let sum = 0;
              for (let j = 0; j < p; j++) sum += timeSeries[i-j].close;
              sma = sum / p;
          }
          smas[p] = sma || d.close;
      });

      let volSma20 = d.volume;
      if (i >= 19) {
        let vSum = 0;
        for (let j = 0; j < 20; j++) vSum += timeSeries[i-j].volume;
        volSma20 = vSum / 20;
      }

      if (i > 0) {
        maPeriods.forEach(p => {
           currentEMAs[p] = (d.close - currentEMAs[p]) * emaAlphas[p] + currentEMAs[p];
        });
        currentEMA12 = (d.close - currentEMA12) * ema12Alpha + currentEMA12;
        currentEMA26 = (d.close - currentEMA26) * ema26Alpha + currentEMA26;
      }

      const macd = currentEMA12 - currentEMA26;
      if (i === 0) {
        currentMacdSignal = macd;
      } else {
        currentMacdSignal = (macd - currentMacdSignal) * ema9Alpha + currentMacdSignal;
      }
      const macdHist = macd - currentMacdSignal;

      const typicalPrice = (d.high + d.low + d.close) / 3;
      cumulativeVolume += d.volume;
      cumulativeVolPrice += typicalPrice * d.volume;
      const vwap = cumulativeVolume > 0 ? cumulativeVolPrice / cumulativeVolume : d.close;

      // RSI calculation
      let rsi = null;
      if (i > 0) {
        const change = d.close - timeSeries[i-1].close;
        const gain = Math.max(0, change);
        const loss = Math.max(0, -change);
        
        if (i < 14) {
          avgGain += gain / 14;
          avgLoss += loss / 14;
        } else if (i === 14) {
          // Initialize first true 14-period average
          let sumGain = 0;
          let sumLoss = 0;
          for(let j=1; j<=14; j++) {
            const c = timeSeries[j].close - timeSeries[j-1].close;
            sumGain += Math.max(0, c);
            sumLoss += Math.max(0, -c);
          }
          avgGain = sumGain / 14;
          avgLoss = sumLoss / 14;
          
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        } else {
          // Smoothed formula (Wilder's Smoothing)
          avgGain = ((avgGain * 13) + gain) / 14;
          avgLoss = ((avgLoss * 13) + loss) / 14;
          
          const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
          rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
        }
      }

      return {
        ...d,
        sma9: smas[9],
        sma21: smas[21],
        sma50: smas[50],
        sma100: smas[100],
        sma150: smas[150],
        sma200: smas[200],
        ema9: currentEMAs[9],
        ema21: currentEMAs[21],
        ema50: currentEMAs[50],
        ema100: currentEMAs[100],
        ema150: currentEMAs[150],
        ema200: currentEMAs[200],
        vwap,
        volSma20,
        macd,
        macdSignal: currentMacdSignal,
        macdHist,
        rsi: rsi !== null ? rsi : 50 // Default to 50 for the first 14 periods if needed
      };
    });
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
