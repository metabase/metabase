"""usage: python3 render.py TRANSCRIPT.jsonl START_LINE END_LINE [--full]
Prints a redacted, readable rendering of the transcript lines. --full raises truncation limits."""
import sys, prep
path, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
if "--full" in sys.argv:
    orig = prep.trunc
    prep.trunc = lambda s, n: orig(s, n * 4)
for ln, s in prep.render(path):
    if a <= ln <= b:
        print(prep.redact(f"L{ln} {s}"))
