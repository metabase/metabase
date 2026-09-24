/**
 * Backend coverage for journey-capture runs: each dump asks the JaCoCo agent for the classes that ran since the previous dump, then resets it.
 * Dumps store indices into backend/classes.jsonl, which every process of a shard appends to.
 *
 * Run directly for dumps taken outside Cypress (backend boot, idle windows):
 *   node e2e/coverage/journey-capture-backend.js <baseline name> [start|end]
 */
const fs = require("node:fs");
const path = require("node:path");

const { dump, hitClasses } = require("./jacoco");

const CLASSES_FILE = "backend/classes.jsonl";

class ClassDictionary {
  constructor(rawDir) {
    this.file = path.join(rawDir, CLASSES_FILE);
    this.indices = new Map();
    if (fs.existsSync(this.file)) {
      const lines = fs.readFileSync(this.file, "utf8").split("\n");
      for (const line of lines) {
        if (line) {
          const [name, id] = JSON.parse(line);
          this.indices.set(`${name} ${id}`, this.indices.size);
        }
      }
    }
  }

  // Keys are the "name id" strings from jacoco.hitClasses.
  indicesOf(keys) {
    const added = [];
    const result = keys.map((key) => {
      let index = this.indices.get(key);
      if (index === undefined) {
        index = this.indices.size;
        this.indices.set(key, index);
        const separator = key.lastIndexOf(" ");
        added.push(
          JSON.stringify([key.slice(0, separator), key.slice(separator + 1)]),
        );
      }
      return index;
    });
    if (added.length > 0) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, added.join("\n") + "\n");
    }
    return result.sort((a, b) => a - b);
  }
}

/**
 * `execFile`, relative to the raw directory, also keeps the dump as a `.exec` file.
 */
async function dumpBackend({ port, rawDir, dictionary, execFile }) {
  const result = await dump({ port, reset: true });
  const session = result.sessions[result.sessions.length - 1];
  const record = {
    window: session ? { start: session.start, end: session.dump } : null,
    classes: dictionary.indicesOf(hitClasses(result)),
  };
  if (execFile) {
    const target = path.join(rawDir, execFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.exec);
    record.exec = execFile;
  }
  return record;
}

async function main() {
  const [name, position = null] = process.argv.slice(2);
  const rawDir = process.env.JOURNEY_CAPTURE_DIR;
  const port = Number(process.env.JOURNEY_BACKEND_COVERAGE_PORT);
  if (!name || !rawDir || !port) {
    console.error(
      "Usage: JOURNEY_CAPTURE_DIR=... JOURNEY_BACKEND_COVERAGE_PORT=... " +
        "node e2e/coverage/journey-capture-backend.js <baseline name> [start|end]",
    );
    process.exit(1);
  }
  const fileName = position ? `${name}-${position}` : name;
  const record = await dumpBackend({
    port,
    rawDir,
    dictionary: new ClassDictionary(rawDir),
    execFile: `backend/exec/baselines/${fileName}.exec`,
  });
  const entry = {
    kind: "baseline",
    baseline: { name, position },
    backend: record,
  };
  const target = path.join(rawDir, "baselines", "backend", `${fileName}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(entry));
  console.log(
    `${fileName}: ${record.classes.length} classes over ` +
      `${record.window ? record.window.end - record.window.start : "?"}ms`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { ClassDictionary, dumpBackend, CLASSES_FILE };
