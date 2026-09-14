// ESLint's flat-config loader reads the config file with a dynamic import,
// which jest's module registry cannot service, so the spec runs this as a child process.

import { ESLint } from "eslint";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const { configFile, cases } = JSON.parse(await readStdin());

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: configFile,
});

const messages = [];
for (const { code, filePath } of cases) {
  const [result] = await eslint.lintText(code, {
    filePath,
    warnIgnored: false,
  });
  messages.push(result ? result.messages : []);
}

process.stdout.write(JSON.stringify(messages));
