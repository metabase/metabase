import { BackendResource } from "./backend.js";
import { spawn } from "child_process";
import { resolve } from "path";
import chalk from "chalk";

const ssrPath = resolve(
  __dirname,
  "../__support__/selenium/node_modules/.bin/selenium-side-runner",
);
const sidePath = resolve(__dirname, "../Metabase.side");
const cwd = resolve(__dirname, "../__support__/selenium");
const backend = BackendResource.get({});

const cleanup = async (exitCode = 0) => {
  console.log(chalk.bold("Cleaning up..."));
  await BackendResource.stop(backend);
  process.exit(exitCode);
};

process.on("SIGTERM", () => cleanup());
process.on("SIGINT", () => cleanup());

(async function() {
  await BackendResource.start(backend);
  console.log("backend", backend);

  return new Promise((resolve, reject) => {
    console.log("ssr", ssrPath);
    console.log("side", sidePath);
    console.log("cwd", cwd);

    const p = spawn(ssrPath, [sidePath, "--base-url", backend.host], {
      cwd: cwd,
      stdio: "inherit",
    });
    p.on("exit", code => (code === 0 ? resolve(0) : reject(code)));
  });
})()
  .then(() => cleanup())
  .catch(code => cleanup(code || 1));
