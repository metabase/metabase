import json, re, subprocess, sys

data = json.load(sys.stdin)
t = data.get("task", data)

def paths(v):
    if isinstance(v, dict):
        return [x.lstrip("/") for x in v.keys()] if v else []
    return [str(x).lstrip("/") for x in (v or [])]

literal = paths(t.get("inputFiles"))
globs   = paths(t.get("inputGlobs"))

def to_re(g):
    out, i = "", 0
    while i < len(g):
        c = g[i]
        if g.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif c == "*" and g[i:i+2] == "**": out += ".*"; i += 2
        elif c == "*": out += "[^/]*"; i += 1
        elif c == "?": out += "[^/]"; i += 1
        elif c == "{":
            j = g.index("}", i)
            out += "(?:" + "|".join(re.escape(x) for x in g[i+1:j].split(",")) + ")"
            i = j + 1
        else: out += re.escape(c); i += 1
    return re.compile("^" + out + "$")

pats = [to_re(g) for g in globs]
tracked = subprocess.run(["git","ls-files"], capture_output=True, text=True).stdout.splitlines()
for f in literal: print(f)
for f in tracked:
    if any(p.match(f) for p in pats): print(f)
