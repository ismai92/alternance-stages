// Lecture en flux d'un tableau JSON geant ([ {...}, {...} ]) sans tout charger en memoire.
// Appelle onItem(objet) pour chaque element de premier niveau.
export async function streamJsonArray(readable, onItem) {
  const decoder = new TextDecoder();
  let depth = 0, inStr = false, esc = false, buf = '', capturing = false, count = 0;
  const handleText = text => {
    let start = capturing ? 0 : -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') {
        depth++;
        if (depth === 2 && c === '{') { capturing = true; start = i; }
      } else if (c === '}' || c === ']') {
        if (depth === 2 && c === '}' && capturing) {
          buf += text.slice(start, i + 1);
          capturing = false; start = -1;
          try { onItem(JSON.parse(buf)); count++; } catch (e) { /* element illisible : ignore */ }
          buf = '';
        }
        depth--;
      }
    }
    if (capturing && start >= 0) buf += text.slice(start);
  };
  for await (const chunk of readable) handleText(decoder.decode(chunk, { stream: true }));
  handleText(decoder.decode());
  return count;
}
