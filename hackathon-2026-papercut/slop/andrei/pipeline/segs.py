# Split a scrubbed chunk into ~6k-char segments; print them (show) or return them (for jev localization).
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SEG = 6000

def segments(cid):
    lines = open(f'{HERE}/chunks_clean/{cid}.txt').read().split('\n')
    segs, cur, size = [], [], 0
    for l in lines:
        cur.append(l)
        size += len(l) + 1
        if size >= SEG:
            segs.append(cur)
            cur, size = [], 0
    if cur:
        segs.append(cur)
    return ['\n'.join(s) for s in segs]

def label(seg):
    first = seg.split('\n', 1)[0].split(']')[0].lstrip('[')
    last = seg.rsplit('\n', 1)[-1].split(']')[0].lstrip('[')
    return f'{first} .. {last}'

if __name__ == '__main__':
    # usage: segs.py CID [SEG_NUMBERS...]   (no numbers = whole chunk)
    cid, want = sys.argv[1], {int(x) for x in sys.argv[2:]}
    for n, s in enumerate(segments(cid)):
        if not want or n in want:
            print(f'===== segment s{n} ({label(s)}) =====\n{s}\n')
