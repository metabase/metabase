# Ask jev (TypeSafe System One) papercut questions about each transcript chunk.
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from sanitize import scrub

URL = 'https://api.typesafe.ai/v1/systemone'
HERE = os.path.dirname(os.path.abspath(__file__))
KEY = next(l.split('=', 1)[1].strip().strip('"\'') for l in open(os.path.expanduser('~/src/mb/docs/.env')) if l.startswith('TYPESAFE_API_KEY='))

CONTEXT = (
    "An excerpt of a transcript from a Claude Code session: an AI coding agent working for a software engineer, "
    "mostly on the Metabase monorepo (Clojure backend, TypeScript/React frontend) and personal tooling. "
    "Event lines: USER = the human, ASSISTANT = agent's visible text, THINKING = agent's private reasoning, "
    "CALL = a tool call, RESULT = tool output (truncated; ERROR marks a failed call). "
    "We are hunting papercuts: defects in the codebase, tooling, environment or docs that trip up coding agents, "
    "making them introduce subtle bugs, or waste time by using something incorrectly, fumbling, and coming back to fix their work."
)

def q(instructions, true, false):
    return {'type': 'noul', 'instructions': instructions, 'criteria': {'true': true, 'false': false}}

QUESTIONS = {
    'any_papercut': q(
        'Does this excerpt show the agent being tripped up by a papercut: something in the code, tooling, environment or documentation that is misleading or easy to misuse, which made the agent introduce a bug, take a wrong path, or redo work?',
        'The agent hit a concrete obstacle caused by the code, tools, environment or docs (misleading name or API, hidden requirement, surprising tool behaviour, broken or stale setup, local vs CI mismatch, stale cache, flaky test) and lost time or produced a wrong result because of it.',
        'Work proceeds normally, or the only problems are ordinary ones: typos, a compile error fixed on the next try, the user changing requirements, wording or style preferences, permission prompts, the agent simply being asked to do something differently.'),
    'env_toolchain': q(
        'Did a local environment or toolchain problem trip up the agent?',
        'A command failed or misbehaved because of the machine setup: wrong runtime or version, wrong package manager (e.g. yarn or npm instead of bun), missing dependency, env vars leaking into the app, shell aliases or functions shadowing standard commands, PATH, sandbox restrictions, a dev server that must be restarted.',
        'No environment or toolchain problem, or one resolved instantly without confusion.'),
    'stale_state': q(
        'Did stale state or a cache mislead the agent?',
        'The agent trusted results that reflected old state: an incremental build or type-check cache hiding errors, a hot-reloading or long-running server serving old code after a branch switch or rebase, stale node_modules, stale generated files, an outdated worktree or branch.',
        'Nothing stale was involved.'),
    'verify_mismatch': q(
        'Did local verification disagree with the real gate?',
        'Checks the agent ran locally (tests, lint, type check) passed but CI or a separate gate failed, a required lint or test gate was missed, or tests failed locally for reasons unrelated to the change and caused confusion.',
        'Checks behaved as expected, or none were involved.'),
    'misleading_code': q(
        'Did the code itself mislead the agent?',
        'A function, variable, file or type name, docstring, comment or signature suggested behaviour different from the real one, or near-duplicate helpers or APIs made the agent pick the wrong one, and the agent got something wrong because of it.',
        'No evidence of the code itself misleading the agent.'),
    'hidden_coupling': q(
        'Did a hidden coupling or invariant bite the agent?',
        'A change needed coordinated edits elsewhere that were not obvious (generated files or docs, schemas, migrations, sibling callers, parallel OSS/EE or frontend/backend code paths, feature flags, i18n, snapshots, config) and the agent missed it at first.',
        'No missed coordinated change.'),
    'stale_docs': q(
        'Did wrong or outdated instructions send the agent the wrong way?',
        'A README, developer doc, CLAUDE.md, skill, code comment, ticket or prompt described steps or behaviour that turned out to be wrong or outdated, and the agent followed it.',
        'No wrong instructions were followed.'),
    'tool_footgun': q(
        'Did an external tool or API have surprising semantics that the agent misused?',
        'A CLI, API or integration (git, gh, package manager, MCP server, Slack/Linear/Notion tools, browser automation, test runner) behaved surprisingly: an edit that overwrites fields, a command that silently does nothing, a hang, a misleading exit code or output. The agent misused it or had to repair damage.',
        'Tools behaved as the agent expected.'),
    'flaky': q(
        'Did flaky or nondeterministic behaviour cost the agent time?',
        'Intermittent failures, timeouts, races, flaky tests or unreliable services caused retries or misdiagnosis.',
        'No flakiness.'),
    'agent_bug': q(
        'Did the agent introduce a defect that was caught later in this excerpt?',
        'Something the agent wrote or changed turned out to be wrong (caught by a test, reviewer, the user, CI or the agent itself) and had to be fixed.',
        'No agent-introduced defect is visible here.'),
    'wasted_effort': q(
        'Did the agent waste significant effort?',
        'The agent repeated failing attempts (three or more similar retries), went down a wrong path for many steps, or redid work after discovering a wrong assumption about the code, tools or environment.',
        'Progress was mostly direct.'),
    'user_correction': q(
        'Did the human correct the agent about how the code, tools or environment actually work?',
        'The user told the agent it was wrong about the codebase, a command, a convention or a tool, or had to explain how to do something technical correctly.',
        'No such correction, or only corrections about tone, wording, formatting, scope or preferences.'),
}

def ask(state, questions=QUESTIONS, tries=6):
    body = json.dumps({'model': 'jev-latest', 'state': state, 'questions': questions}).encode()
    for n in range(tries):
        req = urllib.request.Request(URL, body, {'authorization': f'Bearer {KEY}', 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                msg = e.read()[:300].decode(errors='replace')
            except Exception:
                msg = ''
            if e.code in (400, 403, 413, 422):
                return {'error': f'{e.code} {msg}'}
            err = f'{e.code} {msg}'
        except Exception as e:
            err = repr(e)[:300]
        time.sleep(2 ** n)
    return {'error': err}

def state_for(r):
    text = open(f"{HERE}/chunks_clean/{r['cid']}.txt").read()
    sess = {k: scrub(r.get(k) or '') for k in ('title', 'first_prompt')}
    sess['project'] = r['project'].replace('-Users-andrei-', '~/').replace('-', '/')
    if r.get('parent'):
        sess['note'] = 'This is a subagent transcript; the first USER message is the brief from the parent agent.'
    sess['part'] = f"{r['chunk'] + 1} of {r['nchunks']}"
    return {'context': CONTEXT, 'session': sess, 'excerpt': text}

def score(r):
    res = ask(state_for(r))
    out = {'cid': r['cid']}
    if 'answers' in res:
        out['p'] = {k: round(v['noul'], 4) for k, v in res['answers'].items()}
        out['usage'] = res.get('usage')
    else:
        out['error'] = res.get('error')
    return out

def main():
    idx = [json.loads(l) for l in open(f'{HERE}/index.jsonl')]
    if os.environ.get('SCOPE', 'mb') == 'mb':
        idx = [r for r in idx if r['project'] in ('-Users-andrei-src-mb', '-Users-andrei')]
    if sys.argv[1] == 'test':
        for r in idx:
            if r['cid'] in sys.argv[2:]:
                print(json.dumps(score(r)))
        return
    path = f'{HERE}/scores.jsonl'
    done = set()
    if os.path.exists(path):
        done = {json.loads(l)['cid'] for l in open(path) if 'p' in json.loads(l)}
    todo = [r for r in idx if r['cid'] not in done]
    print('todo', len(todo), flush=True)
    with open(path, 'a') as fh, ThreadPoolExecutor(int(sys.argv[2]) if len(sys.argv) > 2 else 16) as ex:
        futs = [ex.submit(score, r) for r in todo]
        for n, f in enumerate(as_completed(futs), 1):
            try:
                res = f.result()
            except Exception as e:
                continue
            fh.write(json.dumps(res) + '\n')
            fh.flush()
            if n % 100 == 0:
                print(n, flush=True)

if __name__ == '__main__':
    main()

def score_split(r, depth=0):
    # Retry path for chunks jev rejects (too many tokens, or a 403 from the API's firewall): halve and take the max per question.
    st = state_for(r)
    text = st['excerpt']
    res = ask(st) if depth else {'error': 'split'}
    if 'answers' in res:
        return {k: v['noul'] for k, v in res['answers'].items()}, 1, 0
    if depth >= 3 or len(text) < 4000:
        return None, 0, 1
    lines = text.split('\n')
    halves = ['\n'.join(lines[:len(lines) // 2]), '\n'.join(lines[len(lines) // 2:])]
    best, ok, bad = {}, 0, 0
    for h in halves:
        sub = dict(r)
        sub['_text'] = h
        p, o, b = score_split(sub, depth + 1)
        ok, bad = ok + o, bad + b
        for k, v in (p or {}).items():
            best[k] = max(best.get(k, 0), v)
    return best or None, ok, bad

_state_for = state_for
def state_for(r):
    st = _state_for(r)
    if '_text' in r:
        st['excerpt'] = r['_text']
    return st

def retry_errors():
    path = f'{HERE}/scores.jsonl'
    rows = [json.loads(l) for l in open(path)]
    good = {x['cid'] for x in rows if 'p' in x}
    idx = {r['cid']: r for r in map(json.loads, open(f'{HERE}/index.jsonl'))}
    todo = sorted({x['cid'] for x in rows if 'p' not in x} - good)
    def one(cid):
        p, ok, bad = score_split(idx[cid])
        return {'cid': cid, 'p': {k: round(v, 4) for k, v in p.items()}, 'split_parts_ok': ok, 'split_parts_failed': bad} if p else {'cid': cid, 'error': f'unscorable after split ({bad} parts failed)'}
    with ThreadPoolExecutor(8) as ex:
        out = list(ex.map(one, todo))
    with open(path, 'a') as fh:
        for o in out:
            fh.write(json.dumps(o) + '\n')
    print('retried', len(todo), 'recovered', sum('p' in o for o in out))
