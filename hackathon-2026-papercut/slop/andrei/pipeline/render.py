# Render Claude Code transcripts into compact event text and ~60k-char chunks for jev.
import json, glob, os, re, sys

ROOT = os.path.expanduser('~/.claude/projects')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chunks')
SKIP_SESSION = '85038dbf-fa74-48b2-8ca5-c69821738408'  # this session
CHUNK = 60000
OVERLAP = 6000
SR = re.compile(r'<system-reminder>.*?</system-reminder>', re.S)

def clip(s, head, tail=0):
    s = SR.sub('', s or '').strip()
    if len(s) <= head + tail:
        return s
    return s[:head] + f' [...{len(s) - head - tail} chars...] ' + (s[-tail:] if tail else '')

def result_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return '\n'.join(b.get('text', '') if b.get('type') == 'text' else f"[{b.get('type')}]" for b in c)
    return str(c)

def tool_call(b):
    n, i = b.get('name', '?'), b.get('input') or {}
    if n == 'Bash':
        return f"Bash: {clip(i.get('command', ''), 600)}"
    if n in ('Edit', 'MultiEdit'):
        return f"{n} {i.get('file_path')}: old={clip(i.get('old_string', ''), 200)!r} new={clip(i.get('new_string', ''), 300)!r}"
    if n == 'Write':
        return f"Write {i.get('file_path')}: {clip(i.get('content', ''), 200)!r}"
    if n == 'Read':
        return f"Read {i.get('file_path')} {i.get('offset', '')}"
    if n in ('Agent', 'Task'):
        return f"{n} ({i.get('subagent_type', '')}) {i.get('description', '')}: {clip(i.get('prompt', ''), 600)}"
    return f"{n}: {clip(json.dumps(i, ensure_ascii=False), 400)}"

def events(path):
    ev = []
    for ln, line in enumerate(open(path, encoding='utf-8', errors='replace'), 1):
        try:
            d = json.loads(line)
        except Exception:
            continue
        t, m = d.get('type'), d.get('message')
        if t not in ('user', 'assistant') or not isinstance(m, dict):
            continue
        c = m.get('content')
        if isinstance(c, str):
            s = clip(c, 3000, 1000)
            if s:
                ev.append((ln, f'USER: {s}'))
            continue
        for b in c or []:
            bt = b.get('type')
            if t == 'user' and bt == 'text':
                s = clip(b.get('text', ''), 3000, 1000)
                if s:
                    ev.append((ln, f'USER: {s}'))
            elif bt == 'tool_result':
                err = b.get('is_error')
                s = clip(result_text(b.get('content')), 1000 if err else 400, 500 if err else 200)
                ev.append((ln, f"RESULT{' (ERROR)' if err else ''}: {s}"))
            elif bt == 'text':
                s = clip(b.get('text', ''), 1500, 500)
                if s:
                    ev.append((ln, f'ASSISTANT: {s}'))
            elif bt == 'thinking':
                s = clip(b.get('thinking', ''), 800, 400)
                if s:
                    ev.append((ln, f'THINKING: {s}'))
            elif bt == 'tool_use':
                ev.append((ln, f'CALL {tool_call(b)}'))
    return ev

def meta(path):
    title = first = cwd = branch = ts = None
    for line in open(path, encoding='utf-8', errors='replace'):
        try:
            d = json.loads(line)
        except Exception:
            continue
        title = d.get('customTitle') or d.get('aiTitle') or title
        cwd = cwd or d.get('cwd')
        branch = branch or d.get('gitBranch')
        ts = ts or d.get('timestamp')
        m = d.get('message')
        if first is None and d.get('type') == 'user' and isinstance(m, dict) and isinstance(m.get('content'), str):
            first = clip(m['content'], 600)
    return dict(title=title, first_prompt=first, cwd=cwd, branch=branch, started=ts)

def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(f'{ROOT}/*/*.jsonl') + glob.glob(f'{ROOT}/*/*/subagents/*.jsonl'))
    index = []
    for f in files:
        if SKIP_SESSION in f:
            continue
        ev = events(f)
        if not ev:
            continue
        sid = os.path.basename(f)[:-6]
        parent = f.split('/')[-3] if '/subagents/' in f else None
        info = dict(file=f, sid=sid, parent=parent, project=f.split('/')[len(ROOT.split('/'))], **meta(f))
        lines = [f'[e{k} L{ln}] {s}' for k, (ln, s) in enumerate(ev)]
        chunks, cur, size, start = [], [], 0, 0
        for k, s in enumerate(lines):
            cur.append(s)
            size += len(s) + 1
            if size >= CHUNK:
                chunks.append((start, k, '\n'.join(cur)))
                back, keep = 0, []
                for x in reversed(cur):
                    back += len(x) + 1
                    if back > OVERLAP:
                        break
                    keep.insert(0, x)
                cur, size, start = keep, sum(len(x) + 1 for x in keep), k - len(keep) + 1
        if cur:
            chunks.append((start, len(lines) - 1, '\n'.join(cur)))
        for n, (a, b, text) in enumerate(chunks):
            cid = f'{sid}.{n}'
            with open(f'{OUT}/{cid}.txt', 'w') as fh:
                fh.write(text)
            index.append(dict(info, cid=cid, chunk=n, nchunks=len(chunks), e_from=a, e_to=b, chars=len(text)))
    with open('index.jsonl', 'w') as fh:
        for r in index:
            fh.write(json.dumps(r) + '\n')
    print(len(files), 'files', len(index), 'chunks', sum(r['chars'] for r in index), 'chars')

main()
