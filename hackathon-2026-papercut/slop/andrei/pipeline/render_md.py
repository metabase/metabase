# Merge drill-down records by slug and render writeups in Chris's slop format.
import glob, json, os, re, sys
from collections import defaultdict
from sanitize import scrub

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{HERE}/out'
PUBLIC = '--public' in sys.argv
TAG = re.compile(r'^\s*L\d+[^\[]*\[([A-Z() ]+)')

def excerpt_filter(text):
    # Public copies keep only tool calls and tool output: no user messages, agent prose or thinking.
    if not PUBLIC:
        return text
    out, keep = [], False
    for line in (text or '').split('\n'):
        m = TAG.match(line)
        if m:
            keep = m.group(1).split()[0] in ('CALL', 'RESULT', 'TOOL')
        if keep:
            out.append(line)
    return '\n'.join(out)
USER = 'andrei'
KINDS = {
    'codebase-trap': 'the Metabase code invites the mistake',
    'test-harness': 'test helpers and runners',
    'misleading-signal': 'output that lies',
    'doc-gap': 'missing or wrong docs',
    'tool-quirk': 'CLI and tool behaviour',
    'env-friction': 'shell, worktree and local environment',
    'agent-behaviour': 'recurring agent habit, usually despite a memory note',
}
SEV = {'high': 0, 'medium': 1, 'low': 2}
SECTIONS = [('summary', 'Summary'), ('symptom', 'Symptom'), ('timeline', 'Timeline'), ('root_cause', 'Root cause'),
            ('why_agents_fall_for_it', 'Why agents fall for it'), ('current_state', 'Current state'),
            ('suggested_fix', 'Suggested fix'), ('detection_signal', 'Detection signal')]

scores = {}
for line in open(f'{HERE}/scores.jsonl'):
    r = json.loads(line)
    if 'p' in r:
        scores[r['cid']] = r['p']
aliases = json.load(open(f'{HERE}/merge_map.json')) if os.path.exists(f'{HERE}/merge_map.json') else {}
drop = set(aliases.pop('_drop', []))

records, negatives = [], []
for f in sorted(glob.glob(f'{HERE}/drill/g*.json')):
    try:
        d = json.load(open(f))
    except Exception as e:
        print('unreadable', f, e)
        continue
    records += d.get('papercuts', [])
    negatives += d.get('not_papercuts', [])

groups = defaultdict(list)
for r in records:
    slug = aliases.get(r['slug'], r['slug'])
    if slug not in drop:
        groups[slug].append(r)

def jev(cid):
    p = scores.get(cid)
    return '{' + ', '.join(f'{k}: {v:.2f}' for k, v in p.items()) + '}' if p else '{}'

def occ_block(o, indent):
    pad = ' ' * indent
    return (f"{pad}- transcript: {o['transcript']}\n{pad}  lines: {o.get('lines') or ''}\n"
            f"{pad}  date: {o.get('date') or ''}\n{pad}  jev: {jev(o.get('cid'))}\n")

def one_line(s):
    return ' '.join(str(s or '').split()).replace('—', ',')

def fence(s):
    s = excerpt_filter(s or '').strip().replace('```', "'''")
    return '```\n' + s + '\n```\n' if s else ''

os.makedirs(OUT, exist_ok=True)
index = defaultdict(list)
for slug, rs in groups.items():
    rs.sort(key=lambda r: (-(r.get('confidence') or 0), -len(r.get('summary', '') + r.get('root_cause', ''))))
    p = rs[0]
    merged = sorted({r['slug'] for r in rs if r['slug'] != slug})
    severity = min((r.get('severity', 'low') for r in rs), key=lambda s: SEV.get(s, 3))
    kind = p.get('kind') if p.get('kind') in KINDS else 'agent-behaviour'
    head = ['---', f"title: {one_line(p['title'])}", f'slug: {slug}', f'kind: {kind}',
            f"impact: {p.get('impact', 'wasted-time')}", f'severity: {severity}',
            f"status: {one_line(p.get('status', 'unknown'))}", f"area: {one_line(p.get('area'))}"]
    if merged:
        head.append(f"merged_from: {', '.join(merged)}")
    body = '\n'.join(head) + '\noccurrences:\n' + occ_block(p['occurrence'], 2) + '---\n'
    for key, heading in SECTIONS:
        if (p.get(key) or '').strip():
            body += f'## {heading}\n{p[key].strip()}\n\n'
    if (p.get('raw_excerpts') or '').strip():
        body += '## Raw excerpts\n' + fence(p['raw_excerpts']) + '\n'
    for r in rs[1:]:
        body += '## Additional occurrence\n' + occ_block(r['occurrence'], 0) + '\n'
        for key in ('symptom', 'timeline'):
            if (r.get(key) or '').strip():
                body += r[key].strip() + '\n\n'
        if (r.get('raw_excerpts') or '').strip():
            body += fence(r['raw_excerpts']) + '\n'
    body = scrub(body).replace('—', ',')
    open(f'{OUT}/{USER}.claude.{slug}.md', 'w').write(body.rstrip() + '\n')
    index[kind].append((SEV.get(severity, 3), -len(rs), severity, len(rs), one_line(p.get('status', 'unknown')).split('#')[0].strip(),
                        scrub(one_line(p['title'])), slug, scrub(one_line(p.get('area')))))

total = sum(len(v) for v in index.values())
lines = [f'# Papercuts from Claude transcripts: index', '',
         f'{total} papercuts from {len(records)} drill-down findings. Mined 2026-09-23 with Jev classification, Jev segment localization and Claude drill-down. '
         'Pipeline: [`pipeline/`](../../pipeline/).', '',
         'Kinds: ' + ', '.join(f'{k} ({v})' for k, v in KINDS.items()) + '.', '']
for kind in KINDS:
    rows = sorted(index.get(kind, []))
    if not rows:
        continue
    lines += [f'## {kind} ({len(rows)})', '', '| severity | occ | status | papercut | area |', '|---|---|---|---|---|']
    for _, _, sev, n, status, title, slug, area in rows:
        lines.append(f"| {sev} | {n} | {status} | [{title.replace('|', '/')}]({USER}.claude.{slug}.md) | {area.replace('|', '/')} |")
    lines.append('')
open(f'{OUT}/{USER}.claude.INDEX.md', 'w').write('\n'.join(lines))

if PUBLIC:
    negatives = []
neg = ['# Negative controls', '', 'Chunks Jev flagged that the drill-down judged not to be papercuts, with the reason. '
       'Useful for calibrating a classifier. Scores are in `pipeline/output/scores.jsonl`.', '']
for n in sorted(negatives, key=lambda n: n.get('cid', '')):
    neg.append(f"- `{n.get('cid')}` {jev(n.get('cid'))}: {scrub(one_line(n.get('reason')))}")
if not PUBLIC:
    open(f'{OUT}/{USER}.claude.negative-controls.md', 'w').write('\n'.join(neg) + '\n')
print(total, 'papercuts,', len(records), 'records,', len(negatives), 'negatives ->', OUT)
