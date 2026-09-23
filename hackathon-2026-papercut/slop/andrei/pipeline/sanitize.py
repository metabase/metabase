# Scrub secrets and PII from text. Exact values from local env/credential files, then patterns.
import json, os, re, sys, glob, collections

H = os.path.expanduser('~')
SECRET_NAME = re.compile(r'(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|DSN|WEBHOOK)', re.I)

def _env_values():
    vals = {}
    files = [os.path.expanduser(p) for p in os.environ.get('SCRUB_ENV_FILES', '').split(':') if p]
    for f in files:
        if not os.path.exists(f):
            continue
        for line in open(f, errors='replace'):
            m = re.match(r'\s*(?:export\s+)?([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$', line)
            if not m:
                continue
            name, v = m.group(1), m.group(2).strip().strip('"\'')
            if v.startswith(('http://', 'https://', './', '/', '~')) and '@' not in v:
                continue
            if len(v) >= 8 and (SECRET_NAME.search(name) or '://' in v and '@' in v):
                vals[v] = name
    def walk(o, name=''):
        if isinstance(o, dict):
            for k, x in o.items():
                walk(x, k)
        elif isinstance(o, list):
            for x in o:
                walk(x, name)
        elif isinstance(o, str) and len(o) >= 16 and ' ' not in o and not o.startswith(('http', '/')):
            vals[o] = name or 'credential'
    for f in [f'{H}/.codex/auth.json']:
        try:
            walk(json.load(open(f)))
        except Exception:
            pass
    try:
        for m in re.finditer(r'(oauth_token|token):\s*(\S{16,})', open(f'{H}/.config/gh/hosts.yml').read()):
            vals[m.group(2)] = 'gh_token'
    except Exception:
        pass
    return sorted(vals.items(), key=lambda kv: -len(kv[0]))

VALUES = _env_values()

PATTERNS = [
    ('private_key', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)', re.S)),
    ('anthropic_key', re.compile(r'sk-ant-[A-Za-z0-9_-]{16,}')),
    ('openai_key', re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}')),
    ('github_token', re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})')),
    ('slack_token', re.compile(r'\bxox[abposr]-[A-Za-z0-9-]{10,}|\bxapp-[A-Za-z0-9-]{10,}')),
    ('aws_key', re.compile(r'\b(?:AKIA|ASIA)[0-9A-Z]{16}\b')),
    ('google_key', re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b')),
    ('stripe_key', re.compile(r'\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}')),
    ('linear_key', re.compile(r'\blin_(?:api|oauth)_[A-Za-z0-9]{20,}')),
    ('notion_key', re.compile(r'\b(?:secret_|ntn_)[A-Za-z0-9]{30,}')),
    ('metabase_api_key', re.compile(r'\bmb_[A-Za-z0-9+/=]{20,}')),
    ('jwt', re.compile(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')),
    ('url_credentials', re.compile(r'(?<=://)[^/\s:@\'"]+:[^/\s@\'"]+(?=@)')),
    ('bearer', re.compile(r'(?i)(?<=bearer )[A-Za-z0-9._~+/=-]{16,}')),
    ('api_key_header', re.compile(r'(?i)(?<=x-api-key: )[^\s\'"]{12,}')),
    ('secret_assignment', re.compile(r'(?i)(?P<pre>\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*\s*[=:]\s*["\']?)[^\s"\'`$<{(\[][^\s"\'`]{7,}')),
    ('email', re.compile(r'\b(?!git@github\.com)[A-Za-z0-9._%+-]+@(?![\w.-]*(?:example\.com|\.test|\.json|\.local)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')),
    ('ipv4', re.compile(r'\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b')),
    ('phone', re.compile(r'(?<![\w.])\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b')),
    ('slack_id', re.compile(r'\b[UWT]0[A-Z0-9]{7,11}\b')),
    ('tailnet_host', re.compile(r'\b[\w-]+\.(?:[\w-]+\.)?ts\.net\b|\b[\w-]+\.ngrok(?:-free)?\.(?:app|dev|io)\b')),
]

_names_file = os.path.expanduser(os.environ.get('SCRUB_NAMES_FILE', '~/.papercut-names'))
_names = open(_names_file).read().split() if os.path.exists(_names_file) else []
NAMES = re.compile(r'\b(?:' + '|'.join(map(re.escape, _names)) + r')\b') if _names else re.compile(r'(?!x)x')

def scrub(text, counts=None):
    counts = counts if counts is not None else collections.Counter()
    for v, name in VALUES:
        if v in text:
            counts['env:' + name] += text.count(v)
            text = text.replace(v, f'[REDACTED:{name}]')
    for rule, rx in PATTERNS:
        rep = (lambda m, r=rule: m.group('pre') + f'[REDACTED:{r}]') if 'pre' in rx.groupindex else f'[REDACTED:{rule}]'
        text, n = rx.subn(rep, text)
        if n:
            counts[rule] += n
    text = text.replace(f'{H}/', '~/').replace(H, '~')
    text, n = NAMES.subn('[person]', text)
    if n:
        counts['name'] += n
    return text

if __name__ == '__main__':
    # usage: sanitize.py SRC_DIR DST_DIR  -> scrubbed copies plus a count of hits per rule (no values printed)
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    total = collections.Counter()
    for f in glob.glob(f'{src}/*'):
        with open(f) as fh:
            out = scrub(fh.read(), total)
        with open(f'{dst}/{os.path.basename(f)}', 'w') as fh:
            fh.write(out)
    print(len(VALUES), 'env values loaded;', dict(total.most_common()))
