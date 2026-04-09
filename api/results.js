export default async function handler(req, res) {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
  }

  try {
    const atrDate = formatDateForATR(date);
    const url = `https://www.attheraces.com/results/Aintree/${atrDate}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HillwaySweepstake/1.0)' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch results', status: response.status });
    }

    const html = await response.text();
    const results = parseResults(html);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ date, results, source: 'attheraces.com' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function formatDateForATR(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function parseResults(html) {
  const races = [];

  // Find race times in the page
  const timeRegex = /(\d{2}:\d{2})/g;
  const seenTimes = new Set();
  let m;
  while ((m = timeRegex.exec(html)) !== null) {
    const time = m[1];
    if (!seenTimes.has(time) && isRaceTime(time)) {
      seenTimes.add(time);
    }
  }

  for (const time of seenTimes) {
    const timeIdx = html.indexOf(time);
    const chunk = html.substring(timeIdx, timeIdx + 5000);

    // Extract horse names from links to horse profile pages
    const horseNames = [];
    const linkRegex = /<a[^>]*href="[^"]*\/horse\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(chunk)) !== null) {
      const name = linkMatch[1].trim();
      if (name.length > 1 && !horseNames.includes(name)) {
        horseNames.push(name);
      }
    }

    // Also try explicit position markers
    let first = null;
    let second = null;

    const firstMatch = chunk.match(/(?:1st|Winner)[:\s]*([A-Z][A-Za-z'\s\-()]+?)(?:\s*\(|<)/i);
    if (firstMatch) first = firstMatch[1].trim();

    const secondMatch = chunk.match(/(?:2nd|Second)[:\s]*([A-Z][A-Za-z'\s\-()]+?)(?:\s*\(|<)/i);
    if (secondMatch) second = secondMatch[1].trim();

    // Fallback: first two horse links (ATR lists in finishing order)
    if (!first && horseNames.length >= 1) first = horseNames[0];
    if (!second && horseNames.length >= 2) second = horseNames[1];

    if (first) {
      races.push({ time, first, second });
    }
  }

  return races;
}

function isRaceTime(time) {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  return h >= 13 && h <= 18 && mins % 5 === 0;
}
