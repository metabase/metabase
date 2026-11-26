import json
import re
import sys
from datetime import date
from pathlib import Path

kind, note = sys.argv[1:]
if kind not in ("major", "minor", "patch") or not note.strip():
    sys.exit("Provide a major, minor or patch bump and a changelog note.")

manifest = Path("package.json")
changelog = Path("CHANGELOG.md")
package = json.loads(manifest.read_text())
if not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}", package["version"]):
    sys.exit("The bump workflow requires a stable package version.")

parts = list(map(int, package["version"].split(".")))
index = ("major", "minor", "patch").index(kind)
parts[index] += 1
parts[index + 1:] = [0] * (2 - index)
version = ".".join(map(str, parts))

header = "# Changelog\n\n"
history = changelog.read_text()
if not history.startswith(header):
    sys.exit("Missing changelog heading.")
entry = f"## {version} ({date.today().isoformat()})\n\n- {note.strip()}\n\n"
changelog.write_text(header + entry + history[len(header):])
package["version"] = version
manifest.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")
print(version)
