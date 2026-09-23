import json, os, sys, glob, re
SENS = r"[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE|DSN|CONN)[A-Za-z0-9_]*"
PATTERNS = [
  (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "<REDACTED-PRIVATE-KEY>"),
  # A key printed only in part, say by `head`, has one marker and not the other.
  (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*", re.S), "<REDACTED-PRIVATE-KEY>"),
  (re.compile(r"\A.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "<REDACTED-PRIVATE-KEY>"),
  # Lines of a key body with neither marker in view.
  (re.compile(r"^[A-Za-z0-9+/]{60,}={0,2}$", re.M), "<REDACTED-KEY-LINE>"),
  (re.compile(r"(?i)\b(" + SENS + r")(\s*[=:]\s*|\"\s*:\s*\")([^\s\"',;]+)"), r"\1\2<REDACTED>"),
  # EDN, as in `.lein-env`: `:mb-db-pass "..."`.
  (re.compile(r"(?i)(::?[\w.*+!?/-]*(?:key|token|secret|password|passwd|pass|pwd|auth|credential|cookie|session|private|dsn|conn)[\w.*+!?-]*)(\s+)\"(?:[^\"\\]|\\.)*\""), r'\1\2"<REDACTED>"'),
  (re.compile(r"(?i)(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{12,}"), r"\1 <REDACTED>"),
  (re.compile(r"(?i)(x-api-key|x-metabase-session|authorization)(\"?\s*[:=]\s*\"?)[^\s\"']+"), r"\1\2<REDACTED>"),
  (re.compile(r"\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|lin_api_[A-Za-z0-9]{20,}|mb_[A-Za-z0-9+/=]{20,})"), "<REDACTED-TOKEN>"),
  (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), "<REDACTED-JWT>"),
  (re.compile(r"([a-z][a-z0-9+.-]*://[^\s:/@]+:)[^\s@/]+@"), r"\1<REDACTED>@"),
  (re.compile(r"(?i)(-p|--password)(\s+|=)\S+"), r"\1\2<REDACTED>"),
  # Bare hex of secret-like length. 40 characters is a git SHA and stays. Last, so known formats keep their label.
  (re.compile(r"(?i)(?<![0-9a-f])(?:[0-9a-f]{32,39}|[0-9a-f]{41,})(?![0-9a-f])"), "<REDACTED-HEX>"),
]
HIGH_ENTROPY = re.compile(r"(?<![A-Za-z0-9/._-])[A-Za-z0-9+_=-]{32,}(?![A-Za-z0-9/._-])")
def _he(m):
    t = m.group(0)
    if re.fullmatch(r"[0-9a-f]{7,40}", t) or re.fullmatch(r"[0-9a-f-]{36}", t): return t  # git shas / uuids
    if sum(c.isdigit() for c in t) >= 3 and any(c.isupper() for c in t) and any(c.islower() for c in t): return "<REDACTED-HIGH-ENTROPY>"
    return t
def redact(s):
    for pat, rep in PATTERNS: s = pat.sub(rep, s)
    return HIGH_ENTROPY.sub(_he, s)
ROOT = os.path.expanduser("~/.claude/projects")
OUT = "chunks.jsonl"
CHUNK = 60000; OVERLAP = 6000

def trunc(s, n):
    # Redact first: cutting can split a key block or token so no pattern matches what is left.
    s = redact(s if isinstance(s, str) else json.dumps(s))
    return s if len(s) <= n else s[:n*2//3] + f" …[{len(s)-n} chars cut]… " + s[-n//3:]

def tool_input(name, inp):
    if name == "Bash": return trunc(inp.get("command",""), 500)
    if name in ("Edit",): return f'{inp.get("file_path")} OLD={trunc(inp.get("old_string",""),250)} NEW={trunc(inp.get("new_string",""),350)}'
    if name == "Write": return f'{inp.get("file_path")} {trunc(inp.get("content",""),300)}'
    if name == "Read": return str(inp.get("file_path"))
    if name == "Agent": return trunc(inp.get("description","")+": "+inp.get("prompt",""), 400)
    return trunc(json.dumps(inp), 300)

def result_text(c):
    c = c.get("content")
    if isinstance(c, list): c = "\n".join(x.get("text","") for x in c if isinstance(x, dict))
    return c or ""

def render(path):
    lines = []
    for i, raw in enumerate(open(path, errors="replace"), 1):
        try: r = json.loads(raw)
        except Exception: continue
        t = r.get("type")
        if t not in ("user","assistant"): continue
        m = r.get("message") or {}
        c = m.get("content")
        if isinstance(c, str):
            if r.get("isMeta") or c.startswith("<local-command") or c.startswith("<command-"): 
                if "<command-name>" in c: lines.append((i, f"[USER-CMD] {trunc(c,300)}"))
                continue
            lines.append((i, f"[USER] {trunc(c, 3000)}")); continue
        for b in c or []:
            bt = b.get("type")
            if bt == "text":
                tag = "USER" if t=="user" else "ASSISTANT"
                lines.append((i, f"[{tag}] {trunc(b.get('text',''), 2500 if t=='user' else 1500)}"))
            elif bt == "thinking" and b.get("thinking"):
                lines.append((i, f"[THINKING] {trunc(b['thinking'], 500)}"))
            elif bt == "tool_use":
                lines.append((i, f"[TOOL {b.get('name')}] {tool_input(b.get('name'), b.get('input') or {})}"))
            elif bt == "tool_result":
                err = " ERROR" if b.get("is_error") else ""
                lines.append((i, f"[RESULT{err}] {trunc(result_text(b), 700)}"))
    return lines

def main():
    files = [p for p in glob.glob(ROOT+"/**/*.jsonl", recursive=True)]
    n = 0
    with open(OUT, "w") as out:
        for p in sorted(files):
            lines = render(p)
            if not lines: continue
            text = [(ln, f"L{ln} {s}") for ln, s in lines]
            start = 0; idx = 0
            while start < len(text):
                size = 0; end = start
                while end < len(text) and (size + len(text[end][1]) < CHUNK or end == start):
                    size += len(text[end][1]) + 1; end += 1
                body = redact("\n".join(s for _, s in text[start:end]))
                out.write(json.dumps({"file": p, "chunk": idx, "first_line": text[start][0], "last_line": text[end-1][0], "subagent": "/subagents/" in p, "text": body})+"\n")
                n += 1; idx += 1
                if end >= len(text): break
                # overlap
                back = 0; ns = end
                while ns > start+1 and back < OVERLAP: ns -= 1; back += len(text[ns][1])
                start = ns
    print(n, "chunks from", len(files), "files")

if __name__ == "__main__":
    main()
