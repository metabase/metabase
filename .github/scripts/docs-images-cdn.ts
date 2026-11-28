// Moves images a PR adds under docs/ to cdn.metabase.com and points the Markdown links at them.
// Takes the PR's changed files on stdin, one per line.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".gif": "image/gif",
};

export const cdnKey = (bytes: Uint8Array, repoPath: string) =>
  `docs/${createHash("sha256").update(bytes).digest("hex")}/${path.posix
    .basename(repoPath)
    .replace(/[^A-Za-z0-9._-]/g, "-")}`;

export function imageSize(bytes: Buffer) {
  if (bytes.toString("latin1", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.toString("latin1", 0, 4) === "GIF8") {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  throw new Error("not a PNG or GIF");
}

export function rewriteMarkdown(
  text: string,
  mdRepoPath: string,
  urlByRepoPath: Map<string, string>,
) {
  const used = new Set<string>();
  const rewritten = text.replace(/\]\(([^\s)]+)/g, (match, dest: string) => {
    const [, file, suffix] = dest.match(/^([^#?]*)(.*)$/)!;
    let decoded = file;
    try {
      decoded = decodeURIComponent(file);
    } catch {}
    const target = path.posix.join(path.posix.dirname(mdRepoPath), decoded);
    const url = urlByRepoPath.get(target);
    if (dest.startsWith("/") || !url) {
      return match;
    }
    used.add(target);
    return `](${url}${suffix}`;
  });
  const urls = new Set(urlByRepoPath.values());
  const wrapped = rewritten.replace(
    /(?<!\[)!\[([^\]]*)\]\(([^\s)#?]+)(#gh-(?:dark|light)-mode-only)(\s+"[^"]*")?\)/g,
    (match, alt: string, url: string, suffix: string, title = "") =>
      urls.has(url) ? `[![${alt}](${url}${title})](${url}${suffix})` : match,
  );
  return { text: wrapped, used };
}

function upload(file: string, key: string, bytes: Buffer) {
  const { width, height } = imageSize(bytes);
  const result = spawnSync(
    "aws",
    [
      "s3api",
      "put-object",
      "--bucket",
      process.env.BUCKET ?? "",
      "--key",
      key,
      "--body",
      file,
      "--content-type",
      CONTENT_TYPES[path.extname(file).toLowerCase()],
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--metadata",
      `width=${width},height=${height}`,
      "--if-none-match",
      "*",
    ],
    { encoding: "utf8" },
  );
  // Keys are content hashes, so an existing object already holds these bytes.
  const exists = /PreconditionFailed|ConditionalRequestConflict/.test(
    result.stderr ?? "",
  );
  if (result.status !== 0 && !exists) {
    throw new Error(
      `Uploading ${file} failed: ${result.stderr?.trim() ?? result.error?.message}`,
    );
  }
}

function main() {
  const fail = (file: string, message: string) => {
    console.log(`::error file=${file}::${message}`);
    process.exitCode = 1;
  };
  const images = readFileSync(0, "utf8")
    .split("\n")
    .filter((f) => /^docs\/.+\.(png|gif|jpe?g|webp|avif)$/i.test(f));
  const candidates = images.filter((f) => /\.(png|gif)$/i.test(f));
  for (const f of images) {
    if (process.env.FORK) {
      fail(
        f,
        "Images can't be uploaded from a fork. Ask a maintainer to push this branch to metabase/metabase.",
      );
    } else if (!candidates.includes(f)) {
      fail(f, "Only PNG and GIF images are supported. Use PNG.");
    }
  }
  if (process.exitCode || candidates.length === 0) {
    return;
  }

  const pngs = candidates.filter((f) => /\.png$/i.test(f));
  if (pngs.length > 0) {
    // Lossless: same pixels, color profile kept.
    const result = spawnSync(
      "oxipng",
      ["--opt", "4", "--strip", "safe", ...pngs],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `oxipng failed: ${result.stderr?.trim() ?? result.error?.message}`,
      );
    }
  }

  const bytesByFile = new Map(candidates.map((f) => [f, readFileSync(f)]));
  const keyByFile = new Map(
    candidates.map((f) => [f, cdnKey(bytesByFile.get(f)!, f)]),
  );
  const urlByRepoPath = new Map(
    candidates.map((f) => [f, `https://cdn.metabase.com/${keyByFile.get(f)}`]),
  );
  const rewrites = new Map<string, string>();
  const used = new Set<string>();
  const pages = readdirSync("docs", { recursive: true })
    .map((entry) => path.posix.join("docs", String(entry)))
    .filter((f) => f.endsWith(".md"));
  // The repo's GitHub front page shows a docs screenshot.
  for (const md of [...pages, "README.md"]) {
    const before = readFileSync(md, "utf8");
    const after = rewriteMarkdown(before, md, urlByRepoPath);
    after.used.forEach((f) => used.add(f));
    if (after.text !== before) {
      rewrites.set(md, after.text);
    }
  }
  for (const f of candidates.filter((f) => !used.has(f))) {
    if (process.env.SKIP_UNLINKED) {
      console.log(`Skipping ${f}: no page links to it inline`);
    } else {
      fail(
        f,
        "No page links to this image inline, like ![alt](./images/x.png). Link it that way or remove it.",
      );
    }
  }
  if (process.exitCode) {
    return;
  }

  const moved = candidates.filter((f) => used.has(f));
  for (const f of moved) {
    upload(f, keyByFile.get(f)!, bytesByFile.get(f)!);
    console.log(`${f} -> ${urlByRepoPath.get(f)}`);
  }
  rewrites.forEach((text, md) => writeFileSync(md, text));
  moved.forEach((f) => unlinkSync(f));
}

// Bun sets `import.meta.main`; jest's types don't know it, and the spec must not run main().
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    main();
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
