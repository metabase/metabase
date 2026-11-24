/* eslint-disable import/no-commonjs */
// Swaps docs PNGs and GIFs for pointer files to their originals at cdn.metabase.com/docs/<sha256>.
const { spawnSync } = require("child_process");
const { createHash } = require("crypto");
const fs = require("fs");

// The repo README links this one by its GitHub path.
const KEEP = ["docs/images/metabase-product-screenshot-updated.png"];
const POINTER_RE = /^sha256 [0-9a-f]{64}\nsize \d+\nwidth \d+\nheight \d+\n$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const shouldConvert = (path) =>
  /^docs\/.*\.(png|gif)$/i.test(path) && !KEEP.includes(path);

function imageInfo(buf) {
  if (
    buf.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buf.toString("latin1", 12, 16) === "IHDR"
  ) {
    return {
      type: "image/png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (/^GIF8[79]a$/.test(buf.toString("latin1", 0, 6))) {
    return {
      type: "image/gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }
  throw new Error("not a PNG or GIF");
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const pointerFor = (hash, size, { width, height }) =>
  `sha256 ${hash}\nsize ${size}\nwidth ${width}\nheight ${height}\n`;

const isPointer = (buf) =>
  buf.length < 200 && POINTER_RE.test(buf.toString("latin1"));

function read(path) {
  const stat = fs.lstatSync(path, { throwIfNoEntry: false });
  if (!stat) {
    return null;
  }
  if (!stat.isFile()) {
    throw new Error(`${path}: not a regular file`);
  }
  return fs.readFileSync(path);
}

function upload(path, key, type) {
  const { status, stderr } = spawnSync(
    "aws",
    [
      "s3api",
      "put-object",
      "--bucket",
      process.env.DOCS_CDN_S3_BUCKET,
      "--key",
      key,
      "--body",
      path,
      "--content-type",
      type,
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--metadata",
      `introduced-in-pr=${process.env.PR_NUMBER}`,
      "--if-none-match",
      "*",
    ],
    { encoding: "utf8" },
  );
  if (
    status !== 0 &&
    !/\((PreconditionFailed|ConditionalRequestConflict)\)/.test(stderr)
  ) {
    throw new Error(`${path}: upload failed\n${stderr}`);
  }
}

const commands = {
  filter(paths) {
    paths.filter(shouldConvert).forEach((path) => console.log(path));
  },
  check(paths) {
    const images = paths.filter(shouldConvert).filter((path) => {
      const buf = read(path);
      return buf && !isPointer(buf);
    });
    if (images.length > 0) {
      console.error(
        `These docs images need to move to the CDN. A maintainer has to push the conversion for PRs from forks (see docs/util/README.md):\n${images.join("\n")}`,
      );
      process.exitCode = 1;
    }
  },
  convert(paths) {
    for (const path of paths.filter(shouldConvert)) {
      const buf = read(path);
      if (buf && !isPointer(buf)) {
        let info;
        try {
          info = imageInfo(buf);
        } catch (error) {
          throw new Error(`${path}: ${error.message}`);
        }
        const hash = sha256(buf);
        upload(path, `docs/${hash}`, info.type);
        fs.writeFileSync(path, pointerFor(hash, buf.length, info));
        console.log(`- \`${path}\` ![](https://cdn.metabase.com/docs/${hash})`);
      }
    }
  },
  async fetch(paths) {
    for (const path of paths) {
      const pointer = read(path);
      if (!pointer || !isPointer(pointer)) {
        throw new Error(`${path}: not a pointer`);
      }
      const hash = pointer.toString("latin1").split(/\s/)[1];
      const response = await fetch(`https://cdn.metabase.com/docs/${hash}`);
      if (!response.ok) {
        throw new Error(`${path}: ${response.status} from the CDN`);
      }
      const buf = Buffer.from(await response.arrayBuffer());
      if (sha256(buf) !== hash) {
        throw new Error(`${path}: the CDN copy doesn't match its sha256`);
      }
      fs.writeFileSync(path, buf);
    }
  },
};

module.exports = { shouldConvert, imageInfo, pointerFor, isPointer };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (!commands[command]) {
    console.error(
      "Usage: docs-images.js <filter|check|convert|fetch> [paths, or one per line on stdin]",
    );
    process.exit(2);
  }
  const paths = args.length
    ? args
    : fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
  (async () => commands[command](paths))().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
