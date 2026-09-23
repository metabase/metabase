// Mechanical SQL → plain English, no model. Strategy #1 of research/embedding-text.md, native-SQL half.
//
// Not a SQL parser: a handful of rules over the patterns analysts actually write (aggregates with aliases,
// GROUP BY, simple WHERE predicates, date windows, CASE buckets, HAVING, LIMIT). Anything it doesn't
// understand it leaves out rather than guessing, so the output only ever says what the query says.
// Identifiers are normalised (`net_amount_eur` → "net amount EUR", `fct_returns` → the table's display name).
// Deterministic: same SQL and table names in, same text out.

/** Physical table name → human name (the corpus's `displayName`). */
export type TableNames = Record<string, string>;

const ABBREV: Record<string, string> = {
  pct: "percent", eur: "EUR", qty: "quantity", cr: "conversion rate", cpc: "cost per click", ctr: "click-through rate",
  mrr: "monthly recurring revenue", aov: "average order value", nps: "NPS", roas: "return on ad spend", subs: "subscriptions",
  m3: "month 3", pos: "purchase orders", po: "purchase order", psp: "payment provider", rma: "return", dsr: "data subject request",
  utm: "UTM", sla: "SLA", blik: "BLIK", sku: "product", id: "", avg: "average", num: "number", n: "count", amt: "amount", rev: "revenue",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `net_amount_eur` → "net amount EUR"; drops `id`, expands known abbreviations. */
export function humanize(ident: string): string {
  return ident
    .replace(/^[a-z]\./i, "")
    .split(/[_\s]+/)
    .map((w) => (w.toLowerCase() in ABBREV ? ABBREV[w.toLowerCase()] : w.toLowerCase()))
    .filter(Boolean)
    .join(" ");
}

const strip = (s: string) => s.replace(/\s+/g, " ").trim();
const unquote = (s: string) => s.trim().replace(/^'(.*)'$/, "$1");

/** Split on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

/** The clause of the OUTERMOST select, i.e. after the last top-level `select` (CTE bodies come first). */
function outerSelect(sql: string): string {
  let depth = 0, last = -1;
  const low = sql.toLowerCase();
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    else if (depth === 0 && low.startsWith("select", i) && /\W/.test(sql[i - 1] ?? " ")) last = i;
  }
  return last >= 0 ? sql.slice(last) : sql;
}

/** Text between `kw` and the next of `stops` at paren depth 0. */
function clause(q: string, kw: RegExp, stops: RegExp): string | null {
  const m = kw.exec(q);
  if (!m) return null;
  const rest = q.slice(m.index + m[0].length);
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "(") depth++;
    else if (rest[i] === ")") depth--;
    else if (depth === 0 && stops.test(rest.slice(i)) && /\W/.test(rest[i - 1] ?? " ")) return rest.slice(0, i).trim();
  }
  return rest.trim();
}

/** One SELECT expression → a phrase, or null when it's a plain dimension column. */
function measurePhrase(expr: string): string | null {
  const [body, alias] = (() => {
    const m = /^(.*?)\s+as\s+([a-z_][a-z0-9_]*)$/is.exec(expr);
    return m ? [strip(m[1]), m[2]] : [strip(expr), null];
  })();
  const b = body.toLowerCase();
  if (/\bcase\b/.test(b) && /then\s+'/.test(b)) return null;
  const computed = /\b(sum|count|avg|min|max|percentile_cont)\s*\(|\bcase\b/.test(b) || (alias !== null && /[-+*/(]/.test(b) && !/^(date_trunc|extract|coalesce)\s*\(|::\w+$/.test(b));
  if (!computed) return null;
  // The alias is the analyst's own name for the number: usually the best description there is.
  if (alias) {
    let p = humanize(alias);
    if (/percentile_cont\s*\(\s*0?\.5/.test(b) && !/median/.test(p)) p = `median ${p}`;
    return p;
  }
  let m: RegExpExecArray | null;
  if ((m = /^count\s*\(\s*distinct\s+([\w.]+)\s*\)$/.exec(b))) return `number of distinct ${humanize(m[1])}`;
  if (/^count\s*\(\s*\*\s*\)$/.test(b)) return "count";
  if ((m = /^(sum|avg|min|max)\s*\(\s*([\w.]+)\s*\)$/.exec(b))) {
    return `${{ sum: "total", avg: "average", min: "minimum", max: "maximum" }[m[1]]} ${humanize(m[2])}`;
  }
  return null;
}

/** date_trunc('month', x) → "month"; plain column → its human name. */
function dimensionPhrase(expr: string, aliases: Record<string, string> = {}): string {
  const alias = /\s+as\s+([a-z_][a-z0-9_]*)$/i.exec(expr)?.[1];
  const body = strip(expr.replace(/\s+as\s+[a-z_][a-z0-9_]*$/i, ""));
  if (/\bcase\b/i.test(body)) return alias ? humanize(alias) : "category";
  const named = /^(\w+)\.name$/i.exec(body);
  if (named && aliases[named[1]]) return aliases[named[1]];
  let m: RegExpExecArray | null;
  if ((m = /date_trunc\s*\(\s*'(\w+)'/i.exec(body))) return m[1].toLowerCase();
  if ((m = /extract\s*\(\s*(\w+)\s+from/i.exec(body))) return m[1].toLowerCase();
  if ((m = /coalesce\s*\(\s*([\w.]+)/i.exec(body))) return humanize(m[1]);
  if ((m = /::date$/i.exec(body))) return "day";
  return humanize(body);
}

const INTERVAL = /(?:now\(\)|current_date)\s*-\s*(?:interval\s*'(\d+)\s*(\w+?)s?'|(\d+))/i;

/** One WHERE/HAVING conjunct → a phrase, or null if not understood. */
function predicatePhrase(p: string, tables: TableNames, ctx: QueryCtx = { aliases: {}, leftJoined: new Set() }): string | null {
  // `a / nullif(b, 0)` reads as "a per b"; normalise it to one identifier so the comparison rules apply.
  const s = strip(p).replace(/^\(|\)$/g, "")
    .replace(/([\w.]+)\s*\/\s*nullif\s*\(\s*([\w.]+)\s*,\s*0\s*\)/gi, (_, a, b) => `${a.replace(/^\w+\./, "")}_per_${b.replace(/^\w+\./, "")}`);
  let m: RegExpExecArray | null;
  // LEFT JOIN … WHERE joined.col IS NULL is an anti-join: rows with no match in the joined table.
  if ((m = /^(\w+)\.\w+\s+is\s+null$/i.exec(s)) && ctx.leftJoined.has(m[1])) return `excluding any in ${ctx.aliases[m[1]]}`;
  if ((m = /^([\w.]+)\s*(?:>=|>)\s*(.+)$/i.exec(s)) && INTERVAL.test(m[2])) {
    const w = INTERVAL.exec(m[2])!;
    const n = w[1] ?? w[3], unit = w[2] ?? "day";
    return `in the last ${n} ${unit}${n === "1" ? "" : "s"}`;
  }
  if ((m = /date_trunc\s*\(\s*'(\w+)'.*?\)\s*-\s*interval\s*'(\d+)\s*(\w+)'/i.exec(s))) return `in the previous ${m[1]}`;
  if ((m = /^extract\s*\(\s*month\s+from\s+[\w.]+\s*\)\s*=\s*(\d+)$/i.exec(s))) return `in ${MONTHS[Number(m[1]) - 1]}`;
  if ((m = /^extract\s*\(\s*quarter\s+from\s+[\w.]+\s*\)\s*=\s*(\d)$/i.exec(s))) return `in Q${m[1]}`;
  if ((m = /^([\w.]+)\s*<\s*'(\d{4})-01-01'$/i.exec(s))) return `before ${m[2]}`;
  if ((m = /^([\w.]+)\s+is\s+not\s+null$/i.exec(s))) return `with a ${humanize(m[1])}`;
  if ((m = /^([\w.]+)\s+is\s+null$/i.exec(s))) return `with no ${humanize(m[1])}`;
  if ((m = /^coalesce\s*\(\s*([\w.]+)\s*,\s*''\s*\)\s*<>\s*'([^']*)'$/i.exec(s))) return `${humanize(m[1])} not ${humanize(m[2])}`;
  if ((m = /^([\w.]+)\s*=\s*'([^']*)'$/i.exec(s))) return `${humanize(m[1])} is ${m[2]}`;
  if ((m = /^([\w.]+)\s*(?:<>|!=)\s*'([^']*)'$/i.exec(s))) return `${humanize(m[1])} is not ${m[2]}`;
  if ((m = /^([\w.]+)\s+(not\s+)?in\s*\(([^)]*)\)$/i.exec(s))) {
    const vals = m[3].split(",").map(unquote).join(" or ");
    return `${humanize(m[1])} ${m[2] ? "not " : ""}${vals}`;
  }
  if ((m = /^([\w.]+)\s+(not\s+)?like\s+'([^%']*)%'$/i.exec(s))) return `${humanize(m[1])} ${m[2] ? "not " : ""}starting with ${m[3]}`;
  if ((m = /^([\w.]+)\s+ilike\s+'%([^%']*)%'$/i.exec(s))) return `${humanize(m[1])} mentions "${m[2]}"`;
  if ((m = /^([\w.]+)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)$/.exec(s))) {
    const op = { "<=": "at most", ">=": "at least", "<": "below", ">": "above", "=": "equal to" }[m[2]]!;
    return `${humanize(m[1])} ${op} ${m[3]}`;
  }
  if ((m = /^([\w.]+)\s*(<|>)\s*([\w.]+)\s*\+\s*interval\s*'(\d+)\s*(\w+)'$/i.exec(s))) {
    return `${humanize(m[1])} ${m[2] === ">" ? "more" : "less"} than ${m[4]} ${m[5]} after ${humanize(m[3])}`;
  }
  if ((m = /^([\w.]+)\s*(<|>|<=|>=)\s*([\w.]+)$/.exec(s)) && !/^\d/.test(m[3])) {
    const rel = { ">": "after", "<": "before", ">=": "on or after", "<=": "on or before" }[m[2]]!;
    const a = humanize(m[1]), b = humanize(m[3]);
    return /date|_at$|day/.test(m[1] + m[3]) ? `${a} ${rel} ${b}` : `${a} ${{ ">": "greater than", "<": "less than", ">=": "at least", "<=": "at most" }[m[2]]} ${b}`;
  }
  if ((m = /^([\w.]+)\s*=\s*\(\s*select\s+max\s*\(/i.exec(s))) return `latest ${humanize(m[1])}`;
  if ((m = /^(not\s+)?([\w.]+)$/i.exec(s))) return `${m[1] ? "not " : ""}${humanize(m[2])}`;
  if (/\bor\b/i.test(s)) {
    const parts = s.split(/\s+or\s+/i).map((x) => predicatePhrase(x, tables, ctx)).filter(Boolean);
    return parts.length ? parts.join(" or ") : null;
  }
  return null;
}

/** CASE WHEN … THEN 'label' → the labels, the way the query buckets rows. */
function caseBuckets(sql: string): string[] {
  const labels = [...sql.matchAll(/then\s+'([^']+)'/gi), ...sql.matchAll(/else\s+'([^']+)'/gi)].map((m) => m[1]);
  return [...new Set(labels)];
}

interface QueryCtx { aliases: Record<string, string>; leftJoined: Set<string> }

/** Table aliases → human table names, and which aliases are LEFT JOINed. */
function queryCtx(sql: string, tables: TableNames): QueryCtx {
  const aliases: Record<string, string> = {}, leftJoined = new Set<string>();
  const kw = /^(on|using|where|join|left|inner|group|order|limit|having)$/i;
  for (const m of sql.matchAll(/\b(left\s+)?(?:from|join)\s+(?:\w+\.)?([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_]\w*))?/gi)) {
    const [, left, table, alias] = m;
    if (!(table in tables)) continue;
    const a = alias && !kw.test(alias) ? alias : table;
    aliases[a] = tables[table];
    if (left) leftJoined.add(a);
  }
  return { aliases, leftJoined };
}

/** Every table read, in first-seen order, as human names. */
function tablesRead(sql: string, tables: TableNames): string[] {
  const names = [...sql.matchAll(/\b(?:from|join)\s+(?:\w+\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]);
  const human = names.filter((n) => n in tables).map((n) => tables[n]);
  return [...new Set(human)];
}

/** Text a card's SQL means, in one or two plain sentences. */
export function sqlToText(sql: string, tables: TableNames): string {
  const q = outerSelect(sql);
  const ctx = queryCtx(sql, tables);
  const selectList = clause(q, /^\s*select\s+/i, /^(from)\b/i) ?? "";
  const items = splitTop(selectList);
  const measures = items.map(measurePhrase).filter((x): x is string => !!x);
  const groupBy = clause(q, /\bgroup\s+by\s+/i, /^(having|order|limit)\b/i);
  const dims = groupBy
    ? splitTop(groupBy).map((g) => (/^\d+$/.test(g) ? dimensionPhrase(items[Number(g) - 1] ?? g, ctx.aliases) : dimensionPhrase(g, ctx.aliases)))
    : [];
  // WHERE from the whole statement (CTE filters matter too), HAVING from the outer query.
  const wheres = [...sql.matchAll(/\bwhere\s+/gi)].map((m) =>
    clause(sql.slice(m.index!), /^where\s+/i, /^(group|order|having|limit|union|\))\b|^\)/i) ?? "");
  const conds = wheres
    .flatMap((w) => w.split(/\s+and\s+(?![^()]*\))/i))
    .map((p) => predicatePhrase(p, tables, ctx))
    .filter((x): x is string => !!x);
  const having = clause(q, /\bhaving\s+/i, /^(order|limit)\b/i);
  const limit = /\blimit\s+(\d+)/i.exec(q)?.[1];
  const buckets = caseBuckets(sql);
  const read = tablesRead(sql, tables);

  const what = measures.length ? measures.join(", ") : read.length ? `${read[0]} rows` : "rows";
  const by = dims.filter((d) => !measures.includes(d));
  let text = limit ? `Top ${limit} by ${what}` : what[0].toUpperCase() + what.slice(1);
  if (by.length) text += ` by ${[...new Set(by)].join(" and ")}`;
  if (conds.length) text += `, where ${[...new Set(conds)].join(", ")}`;
  if (having) text += `, only where ${strip(having).replace(/sum\(([\w.]+)\)/gi, (_, c) => `total ${humanize(c)}`).replace(/count\(\*\)/gi, "count").replace(/[a-z]\.(\w+)/g, (_, c) => humanize(c))}`;
  text += ".";
  if (buckets.length > 1) text += ` Grouped into ${buckets.join(", ")}.`;
  if (read.length) text += ` From ${read.join(", ")}.`;
  return text.replace(/\s+/g, " ");
}
