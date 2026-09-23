# Rebuild andrei.claude.INDEX.md from the write-ups left in a directory (after review edits and deletions).
import glob, os, re, sys

D = sys.argv[1]
KINDS = ['codebase-trap', 'test-harness', 'misleading-signal', 'doc-gap', 'tool-quirk', 'env-friction', 'agent-behaviour']
LEGEND = ('Kinds: codebase-trap (the Metabase code invites the mistake), test-harness (test helpers and runners), '
          'misleading-signal (output that lies), doc-gap (missing or wrong docs), tool-quirk (CLI and tool behaviour), '
          'env-friction (shell, worktree and local environment), agent-behaviour (recurring agent habit).')
SEV = {'high': 0, 'medium': 1, 'low': 2}

rows = {k: [] for k in KINDS}
for f in sorted(glob.glob(f'{D}/andrei.claude.*.md')):
    name = os.path.basename(f)
    if name.endswith(('INDEX.md', 'negative-controls.md')):
        continue
    text = open(f).read()
    front = text.split('\n---\n', 1)[0]
    meta = {m.group(1): m.group(2).strip() for m in re.finditer(r'^(\w+):\s*(.*)$', front, re.M)}
    occ = len(re.findall(r'^\s*- transcript:', text, re.M))
    kind = meta.get('kind') if meta.get('kind') in rows else 'agent-behaviour'
    status = meta.get('status', 'unknown').split('#')[0].strip()
    rows[kind].append((SEV.get(meta.get('severity'), 3), -occ, meta.get('severity', ''), occ, status,
                       meta.get('title', '').replace('|', '/'), name, meta.get('area', '').replace('|', '/')))

total = sum(len(v) for v in rows.values())
out = ['# Papercuts from Claude transcripts: index', '',
       f'{total} papercuts. Mined 2026-09-23 with Jev classification, Jev segment localization and Claude drill-down. '
       'Pipeline: [`pipeline/`](../../pipeline/).', '', LEGEND, '']
for kind in KINDS:
    if not rows[kind]:
        continue
    out += [f'## {kind} ({len(rows[kind])})', '', '| severity | occ | status | papercut | area |', '|---|---|---|---|---|']
    for _, _, sev, occ, status, title, name, area in sorted(rows[kind]):
        out.append(f'| {sev} | {occ} | {status} | [{title}]({name}) | {area} |')
    out.append('')
open(f'{D}/andrei.claude.INDEX.md', 'w').write('\n'.join(out))
print(total, 'papercuts indexed')
