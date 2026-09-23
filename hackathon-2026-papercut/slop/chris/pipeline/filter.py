"""Drop embargoed projects/sessions from chunks.jsonl -> chunks.send.jsonl (whole session dropped if any chunk matches)."""
import json, re

DIR_PAT = re.compile(r"sec-\d|ssrf|bot-1114", re.I)
CONTENT_PAT = re.compile(r"embargo|metabase-private|GHSA-|CVE-\d", re.I)

chunks = [json.loads(l) for l in open("chunks.jsonl")]
drop = set()
for c in chunks:
    proj = c["file"].split("/projects/")[1].split("/")[0]
    if DIR_PAT.search(proj) or CONTENT_PAT.search(c["text"]):
        drop.add(c["file"])
keep = [c for c in chunks if c["file"] not in drop]
with open("chunks.send.jsonl", "w") as out:
    for c in keep:
        out.write(json.dumps(c) + "\n")
print(len(keep), "chunks kept;", len(drop), "files dropped")
