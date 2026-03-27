'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries, HistogramSeries, LineSeries, Time } from 'lightweight-charts';

const TEAM_MAP: Record<string, string> = {
  'NYY': '147', 'BAL': '110', 'BOS': '111', 'TBR': '139', 'TOR': '141',
  'CWS': '145', 'CLE': '114', 'DET': '116', 'KCR': '118', 'MIN': '142',
  'HOU': '117', 'LAA': '108', 'OAK': '133', 'SEA': '136', 'TEX': '140',
  'ATL': '144', 'MIA': '146', 'NYM': '121', 'PHI': '143', 'WSN': '120',
  'CHC': '112', 'CIN': '113', 'MIL': '158', 'PIT': '134', 'STL': '138',
  'ARI': '109', 'COL': '115', 'LAD': '119', 'SDP': '135', 'SFG': '137'
};

function SymbolSearchModal({ isOpen, onClose, onSelect, currentTeam }: { isOpen: boolean, onClose: () => void, onSelect: (t: string) => void, currentTeam: string }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
     if (isOpen) {
        setSearch('');
        setTimeout(() => inputRef.current?.focus(), 50);
     }
  }, [isOpen]);

  if (!isOpen) return null;

  const teams = Object.keys(TEAM_MAP).sort();
  const filtered = teams.filter(t => t.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
         <div className="modal-header">
            <h2>Symbol Search</h2>
            <button onClick={onClose} className="close-btn">×</button>
         </div>
         <input 
            ref={inputRef}
            type="text" 
            placeholder="Search team..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="modal-search" 
         />
         <div className="modal-list team-list">
            {filtered.map(t => (
               <div key={t} className={`team-item ${t === currentTeam ? 'selected' : ''}`} onClick={() => { onSelect(t); onClose(); }}>
                  <div className="team-icon">{t.charAt(0)}</div>
                  <span style={{ fontWeight: 600 }}>{t}</span>
               </div>
            ))}
            {filtered.length === 0 && <div style={{textAlign: 'center', padding: 20, color:'#787B86'}}>No teams found</div>}
         </div>
      </div>
    </div>
  );
}

function TeamChart({ team, fangraphsData, onOpenSearch }: { team: string, fangraphsData: any[], onOpenSearch: () => void }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const [legendData, setLegendData] = useState<any>(null);
  const [activeRange, setActiveRange] = useState('1Month');

  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#D1D4DC' },
        grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
        rightPriceScale: { borderColor: '#2B3139', scaleMargins: { top: 0.1, bottom: 0.2 } },
        timeScale: { borderColor: '#2B3139', timeVisible: true },
        crosshair: { mode: 0 },
      });
      
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#089981', downColor: '#F23645', borderVisible: false,
        wickUpColor: '#089981', wickDownColor: '#F23645'
      });
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26A69A', priceFormat: { type: 'volume' }, priceScaleId: '',
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

      const smaSeries = chart.addSeries(LineSeries, { color: '#FF9800', lineWidth: 1, title: 'SMA 200' });
      const emaSeries = chart.addSeries(LineSeries, { color: '#2196F3', lineWidth: 1, title: 'EMA 50' });
      const vwapSeries = chart.addSeries(LineSeries, { color: '#E91E63', lineWidth: 1, title: 'VWAP' });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;
      smaSeriesRef.current = smaSeries;
      emaSeriesRef.current = emaSeries;
      vwapSeriesRef.current = vwapSeries;

      const handleResize = () => {
        if (chartContainerRef.current) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
        }
      };
      const resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(chartContainerRef.current);

      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.seriesData.get(candleSeries)) {
            const data: any = param.seriesData.get(candleSeries);
            const vol: any = param.seriesData.get(volumeSeries);
            setLegendData({ ...data, volume: vol?.value || 0 });
        }
      });

      return () => { resizeObserver.disconnect(); chart.remove(); chartRef.current = null; };
    }
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const teamId = TEAM_MAP[team];
    if (!teamId) return;

    let isMounted = true;
    async function fetchChart() {
      setLoading(true);
      try {
        const res = await fetch(`/api/schedule?teamId=${teamId}`);
        const data = await res.json();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setScheduleData(data);
          candleSeriesRef.current?.setData(data.map((d: any) => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
          volumeSeriesRef.current?.setData(data.map((d: any) => ({ time: d.time, value: d.volume, color: d.isWin ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)' })));
          smaSeriesRef.current?.setData(data.map((d: any) => ({ time: d.time, value: d.sma200 })));
          emaSeriesRef.current?.setData(data.map((d: any) => ({ time: d.time, value: d.ema50 })));
          vwapSeriesRef.current?.setData(data.map((d: any) => ({ time: d.time, value: d.vwap })));
          
          setLegendData(data[data.length - 1]);
        }
      } catch (e) { }
      if(isMounted) setLoading(false);
    }
    fetchChart();
    return () => { isMounted = false; };
  }, [team]);

  useEffect(() => {
    if (!chartRef.current || scheduleData.length === 0) return;
    const timeScale = chartRef.current.timeScale();
    const lastData = scheduleData[scheduleData.length - 1];
    const TO = lastData.time;
    let FROM = scheduleData[0].time;
    const SECONDS_PER_DAY = 86400;

    if (activeRange === '5m') FROM = TO - 5 * 60;
    else if (activeRange === '15m') FROM = TO - 15 * 60;
    else if (activeRange === '1h') FROM = TO - 3600;
    else if (activeRange === '4h') FROM = TO - 4 * 3600;
    else if (activeRange === '1Day') FROM = TO - SECONDS_PER_DAY;
    else if (activeRange === '1Week') FROM = TO - 7 * SECONDS_PER_DAY;
    else if (activeRange === '1Month') FROM = TO - 30 * SECONDS_PER_DAY;

    // Safety check for Opening Day single-game scenarios where FROM === TO
    if (FROM >= TO) FROM = TO - SECONDS_PER_DAY;
    
    timeScale.setVisibleRange({ from: FROM as Time, to: TO as Time });
  }, [activeRange, scheduleData]);

  const latestStats = useMemo(() => fangraphsData.find((d: any) => d.Team === team) || null, [fangraphsData, team]);

  const technicals = useMemo(() => {
    if (!latestStats) return 'Neutral';
    if (latestStats.WAR > 40) return 'Strong Buy';
    if (latestStats.WAR > 20) return 'Buy';
    if (latestStats.WAR > 5) return 'Neutral';
    if (latestStats.WAR > 0) return 'Sell';
    return 'Strong Sell';
  }, [latestStats]);

  const ratingColor = technicals.includes('Buy') ? '#089981' : technicals.includes('Sell') ? '#F23645' : '#787B86';

  return (
    <div className="chart-wrapper">
      {loading && <div className="loading" style={{position:'absolute', zIndex: 100, background:'rgba(19,23,34,0.7)'}}>Loading {team}...</div>}
      <div className="chart-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button className="title-btn" onClick={onOpenSearch}>
               {team} <span style={{fontSize: 12, opacity: 0.7}}>▼</span>
            </button>
            {latestStats && (
               <div className="inline-stats">
                  <span><strong>WAR:</strong> {latestStats.WAR}</span>
                  <span><strong>wRC+:</strong> {latestStats['wRC+']}</span>
                  <span><strong>OPS:</strong> {latestStats.OPS}</span>
                  <span><strong>HR:</strong> {latestStats.HR}</span>
                  <span style={{ color: ratingColor, marginLeft: 8 }}><strong>{technicals}</strong></span>
               </div>
            )}
        </div>
        {legendData && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#D1D4DC', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ color: '#787B86' }}>O</span><span style={{ color: legendData.open <= legendData.close ? '#089981' : '#F23645' }}>{legendData.open.toFixed(2)}</span>
            <span style={{ color: '#787B86' }}>H</span><span style={{ color: legendData.open <= legendData.close ? '#089981' : '#F23645' }}>{legendData.high.toFixed(2)}</span>
            <span style={{ color: '#787B86' }}>L</span><span style={{ color: legendData.open <= legendData.close ? '#089981' : '#F23645' }}>{legendData.low.toFixed(2)}</span>
            <span style={{ color: '#787B86' }}>C</span><span style={{ color: legendData.open <= legendData.close ? '#089981' : '#F23645' }}>{legendData.close.toFixed(2)}</span>
            <span style={{ color: '#787B86', marginLeft: 8 }}>Vol</span><span style={{ color: legendData.open <= legendData.close ? '#089981' : '#F23645' }}>{legendData.volume?.toLocaleString()}</span>
          </div>
        )}
      </div>
      <div ref={chartContainerRef} className="chart-container" />
      <div className="time-range-toolbar">
        {['5m', '15m', '1h', '4h', '1Day', '1Week', '1Month', 'ALL'].map(r => (
           <button key={r} className={`time-range-btn ${activeRange === r ? 'active' : ''}`} onClick={() => setActiveRange(r)}>{r}</button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [fangraphsData, setFangraphsData] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  
  const [team1, setTeam1] = useState('NYY');
  const [compareTeam, setCompareTeam] = useState('None');
  
  const [modalOpenFor, setModalOpenFor] = useState<'primary' | 'compare' | null>(null);

  const [splitPercent, setSplitPercent] = useState(50);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseUp = () => { isDragging.current = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newPercent = (e.clientX / window.innerWidth) * 100;
      if (newPercent > 10 && newPercent < 90) setSplitPercent(newPercent);
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => setMounted(true), []);
  
  useEffect(() => {
    async function fetchFangraphs() {
      try {
        const res = await fetch('/api/fangraphs');
        const json = await res.json();
        if (Array.isArray(json)) setFangraphsData(json);
      } catch (e) {}
    }
    fetchFangraphs();
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', backgroundColor: '#2962FF', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>{team1.charAt(0)}</div>
          <span style={{ fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' }} onClick={() => setModalOpenFor('primary')}>{team1}</span>
          
          {compareTeam !== 'None' ? (
             <>
               <span style={{ color: '#787B86', marginLeft: 8 }}>vs</span>
               <span style={{ fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', color: '#D1D4DC' }} onClick={() => setModalOpenFor('compare')}>{compareTeam}</span>
               <button onClick={() => setCompareTeam('None')} style={{background:'transparent', border:'none', color:'#F23645', cursor:'pointer', marginLeft: 4}}>✕</button>
             </>
          ) : (
             <button onClick={() => setModalOpenFor('compare')} style={{background:'transparent', border:'1px solid #363A45', color:'#D1D4DC', padding:'4px 8px', borderRadius: 4, cursor:'pointer', marginLeft: 16, fontSize: 13}}>+ Compare Team</button>
          )}
        </div>
        <div style={{ color: '#787B86' }}>1D • MLB</div>
      </div>

      <div className="main-area">
        <div className="charts-container" style={{ flexDirection: 'row' }}>
          {compareTeam !== 'None' ? (
             <>
               <div style={{ width: `${splitPercent}%`, minWidth: 0, position: 'relative', display: 'flex' }}>
                 <TeamChart team={team1} fangraphsData={fangraphsData} onOpenSearch={() => setModalOpenFor('primary')} />
               </div>
               <div 
                 onMouseDown={() => { isDragging.current = true; }} 
                 style={{ width: '4px', background: '#2B3139', cursor: 'col-resize', zIndex: 50, transition: 'background 0.2s' }} 
                 onMouseEnter={e => (e.currentTarget.style.background = '#2962FF')}
                 onMouseLeave={e => (e.currentTarget.style.background = '#2B3139')}
               />
               <div style={{ width: `${100 - splitPercent}%`, minWidth: 0, position: 'relative', display: 'flex' }}>
                 <TeamChart team={compareTeam} fangraphsData={fangraphsData} onOpenSearch={() => setModalOpenFor('compare')} />
               </div>
             </>
          ) : (
             <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
               <TeamChart team={team1} fangraphsData={fangraphsData} onOpenSearch={() => setModalOpenFor('primary')} />
             </div>
          )}
        </div>
      </div>

      <SymbolSearchModal 
        isOpen={modalOpenFor !== null} 
        onClose={() => setModalOpenFor(null)} 
        onSelect={(t) => {
           if (modalOpenFor === 'primary') setTeam1(t);
           if (modalOpenFor === 'compare') setCompareTeam(t);
        }} 
        currentTeam={modalOpenFor === 'primary' ? team1 : compareTeam} 
      />
    </div>
  );
}
