# For flagged chunks, ask jev which ~6k-char segment holds the papercut. Writes loc.jsonl.
import json, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from jev import ask, CONTEXT, HERE
from segs import segments, label

def locate(cid):
    segs = segments(cid)
    if len(segs) == 1:
        return {'cid': cid, 'seg_p': {'s0': 1.0}}
    excerpt = '\n'.join(f'===== SEGMENT s{n} =====\n{s}' for n, s in enumerate(segs))
    crit = {f's{n}': f'segment s{n} ({label(s)})' for n, s in enumerate(segs)}
    crit['none'] = 'no segment shows a papercut'
    qs = {'where': {'type': 'choice',
                    'instructions': 'In which segment is the agent tripped up by a papercut (the failure, wrong turn, rework or correction caused by the code, tools, environment or docs)?',
                    'criteria': crit}}
    res = ask({'context': CONTEXT, 'excerpt': excerpt}, qs)
    if 'answers' not in res:
        return {'cid': cid, 'error': res.get('error')}
    return {'cid': cid, 'seg_p': {k: round(v, 3) for k, v in res['answers']['where']['probabilities'].items()}}

if __name__ == '__main__':
    cids = [l.strip() for l in open(sys.argv[1]) if l.strip()]
    with open(f'{HERE}/loc.jsonl', 'a') as fh, ThreadPoolExecutor(16) as ex:
        for f in as_completed([ex.submit(locate, c) for c in cids]):
            fh.write(json.dumps(f.result()) + '\n')
            fh.flush()
