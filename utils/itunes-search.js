// Free iTunes Search API — no key required.
// Returns an Apple Music track object or null.

const ITUNES_API = 'https://itunes.apple.com/search';

export async function searchAppleMusic(artist, title) {
  // Build a prioritised list of queries to try, from most specific to most lenient
  const queries = buildQueries(artist, title);

  for (const term of queries) {
    const track = await fetchBestMatch(term, artist);
    if (track) return track;
  }

  return null;
}

function buildQueries(artist, title) {
  const queries = [];

  if (artist && title) {
    // Cleanest form: strip parenthetical aliases from artist ("이하이 (LeeHi)" → "이하이 LeeHi")
    queries.push(`${flattenArtist(artist)} ${title}`);
    // Original artist string as fallback
    if (flattenArtist(artist) !== artist) queries.push(`${artist} ${title}`);
  }

  // Title alone (good when artist name is in non-Latin script and search chokes on it)
  if (title) queries.push(title);

  // Artist alone as last resort
  if (artist) queries.push(flattenArtist(artist));

  return [...new Set(queries)].filter(Boolean);
}

// Strip parentheses but keep the content: "이하이 (LeeHi)" → "이하이 LeeHi"
function flattenArtist(artist) {
  return artist.replace(/[()]/g, '').replace(/\s{2,}/g, ' ').trim();
}

async function fetchBestMatch(term, originalArtist) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `${ITUNES_API}?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: 5 })}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results?.length) return null;

    return bestMatch(data.results, originalArtist);
  } catch {
    return null; // AbortError or network failure — try next query
  } finally {
    clearTimeout(timer);
  }
}

function bestMatch(results, artist) {
  if (!artist) return results[0];

  // Normalise: lowercase, strip punctuation, keep Latin + CJK + Hangul + Katakana/Hiragana
  const norm = s => s?.toLowerCase()
    .replace(/[^a-z0-9\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\uac00-\ud7a3\u4e00-\u9fff]/g, '') ?? '';

  const targetArtist = norm(flattenArtist(artist));

  const hit = results.find(r => {
    const a = norm(r.artistName);
    return a && targetArtist && (a.includes(targetArtist) || targetArtist.includes(a));
  });

  return hit ?? results[0];
}
