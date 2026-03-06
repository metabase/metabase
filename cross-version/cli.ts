#!/usr/bin/env bun
import {
  compareVersions,
  getDockerImage,
  type VersionComparisonResult,
} from "../release/src/version-helpers";

const HEAD_IMAGE = "metabase/metabase-head:latest";

function compareWithHead(
  source: string,
  target: string,
): VersionComparisonResult {
  if (source === "HEAD" && target === "HEAD") {
    return "same";
  }
  // HEAD is always considered "newer" than any released version
  if (source === "HEAD") {
    return "downgrade";
  }
  if (target === "HEAD") {
    return "upgrade";
  }
  return compareVersions(source, target);
}

function getImage(version: string): string {
  if (version === "HEAD") {
    return HEAD_IMAGE;
  }
  return getDockerImage(version);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "compare") {
  console.log(compareWithHead(args[0], args[1]));
} else if (cmd === "image") {
  console.log(getImage(args[0]));
} else {
  console.error("Usage: cli.ts <compare|image> [args]");
  process.exit(1);
}
