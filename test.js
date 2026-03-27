const cheerio = require('cheerio');

async function test() {
  const url = 'https://www.fangraphs.com/leaders.aspx?pos=all&stats=bat&lg=all&qual=0&type=8&season=2024&month=0&season1=1950&ind=1&team=0,ts&rost=0&age=0&filter=&players=0&page=1_1000';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    console.log(text.substring(0, 500));
    
  } catch (e) {
    console.error(e);
  }
}
test();
