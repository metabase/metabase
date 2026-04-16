#!/usr/bin/env bun
import {
  compareVersions,
  getDockerImage,
  getMajorVersion,
} from "../release/src/cross-version-helpers";

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "compare") {
  console.log(compareVersions(args[0], args[1]));
} else if (cmd === "image") {
  console.log(getDockerImage(args[0]));
} else if (cmd === "major") {
  console.log(getMajorVersion(args[0]));
} else {
  console.error("Usage: cli.ts <compare|image|major> [args]");
  process.exit(1);
}
