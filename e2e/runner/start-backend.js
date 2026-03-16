#!/usr/bin/env node

const backend = require("./cypress-runner-backend");

async function main() {
  const jarPath = process.env.JAR_PATH;

  if (jarPath) {
    await backend.runFromJar(jarPath);
  } else {
    await backend.runFromSource();
  }

  console.log(`Backend ready on :${process.env.MB_JETTY_PORT}`);

  const cleanup = () => {
    backend.stop();
    process.exit();
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
