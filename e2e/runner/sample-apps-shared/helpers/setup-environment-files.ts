import fs from "fs";

import path from "path";

import { findUp } from "./find-up";
import { logWithPrefix } from "./log-with-prefix";

type EnvFilePaths = {
  exampleEnvFileFullPath: string;
  exampleEnvFileName: string;
  outputEnvFileName: string;
  outputEnvFileFullPath: string;
};

const EXAMPLE_ENV_FILE_NAMES = [".env.example", ".env.sample"];

function getEnvFilePaths({
  rootPath,
  installationPath,
}: {
  rootPath: string;
  installationPath: string;
}): EnvFilePaths | null {
  const exampleEnvFileFullPath = findUp(EXAMPLE_ENV_FILE_NAMES, {
    cwd: installationPath,
    stopAt: rootPath,
  });

  if (!exampleEnvFileFullPath) {
    return null;
  }

  const exampleEnvFilePathData = path.parse(exampleEnvFileFullPath);
  const exampleEnvFileName = exampleEnvFilePathData.name;

  const outputEnvFileDirname = exampleEnvFilePathData.dir;
  const outputEnvFileName = ".env";
  const outputEnvFileFullPath = path.join(
    outputEnvFileDirname,
    outputEnvFileName,
  );

  return {
    exampleEnvFileFullPath,
    exampleEnvFileName,
    outputEnvFileName,
    outputEnvFileFullPath,
  };
}

function ensureEnvFile({
  envFilePaths: {
    exampleEnvFileFullPath,
    exampleEnvFileName,
    outputEnvFileName,
    outputEnvFileFullPath,
  },
  loggerPrefix,
}: {
  envFilePaths: EnvFilePaths;
  loggerPrefix: string;
}) {
  if (fs.existsSync(outputEnvFileFullPath)) {
    logWithPrefix(
      `${outputEnvFileName} already exists. Skipping ${exampleEnvFileName} copy.`,
      loggerPrefix,
    );

    return;
  }

  logWithPrefix(
    `Detected a sample env file ${exampleEnvFileName}. Copying to ${outputEnvFileName}...`,
    loggerPrefix,
  );

  fs.copyFileSync(exampleEnvFileFullPath, outputEnvFileFullPath);
}

function updateEnvFile({
  outputEnvFileFullPath,
  env,
  loggerPrefix,
}: {
  outputEnvFileFullPath: string;
  env: Record<string, string | number>;
  loggerPrefix: string;
}) {
  const envContent = fs.readFileSync(outputEnvFileFullPath, "utf8");

  let lines = envContent.split("\n");

  for (const [key, value] of Object.entries(env)) {
    let found = false;

    lines = lines.map(line => {
      if (line.startsWith(`${key}=`)) {
        found = true;

        return `${key}=${value}`;
      }

      return line;
    });

    if (!found) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(outputEnvFileFullPath, lines.join("\n"));

  logWithPrefix("Updated .env with environment variables", loggerPrefix);
}

export function setupEnvironmentFiles({
  rootPath,
  installationPath,
  env,
  loggerPrefix,
}: {
  rootPath: string;
  installationPath: string;
  env: Record<string, string | number>;
  loggerPrefix: string;
}) {
  const envFilePaths = getEnvFilePaths({ rootPath, installationPath });

  if (!envFilePaths) {
    return;
  }

  const { outputEnvFileFullPath } = envFilePaths;

  ensureEnvFile({ envFilePaths, loggerPrefix });

  updateEnvFile({
    outputEnvFileFullPath,
    env,
    loggerPrefix,
  });
}
