#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";

import path from "path";

import { MOCK_SERVER_PACKAGE_JSON } from "../cli/constants/mock-server-package-json";
import { getExpressServerSnippet } from "../cli/snippets/express-server-snippet";
import { getComponentSnippets } from "../cli/snippets/get-component-snippets";

function installDependencies(tempDir: string) {
  execSync("yarn", { cwd: tempDir, stdio: "inherit" });
}

function setupOutDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}

const cwd = path.join(__dirname, "..");
const tempDir = path.join(cwd, "cli-snippets-tmp");

const generateComponentSnippets = () => {
  [
    { folderName: "user-switch-enabled", userSwitcherEnabled: true },
    { folderName: "user-switch-disabled", userSwitcherEnabled: false },
  ].forEach(({ folderName, userSwitcherEnabled }) => {
    const outDir = path.join(tempDir, folderName);

    setupOutDir(outDir);

    const snippets = getComponentSnippets({
      instanceUrl: "https://example.com",
      apiKey: "key",
      dashboards: [{ id: 1, name: "Test dashboard" }],
      userSwitcherEnabled,
      isNextJs: false,
    });

    for (const { fileName, content } of snippets) {
      const filePath = path.join(outDir, `${fileName}.jsx`);
      fs.writeFileSync(filePath, content, "utf8");
    }
  });
};

const generateExpressServerSnippet = () => {
  const outDir = path.join(tempDir, "express-server");

  setupOutDir(outDir);

  const snippetContent = getExpressServerSnippet({
    instanceUrl: "https://example.com",
    tenantIdsMap: {},
  });
  const packageJsonContent = JSON.stringify(MOCK_SERVER_PACKAGE_JSON, null, 2);

  const snippetFilePath = path.join(outDir, "server.js");
  const packageJsonFilePath = path.join(outDir, "package.json");

  fs.writeFileSync(snippetFilePath, snippetContent, "utf8");
  fs.writeFileSync(packageJsonFilePath, packageJsonContent, "utf8");

  installDependencies(outDir);
};

fs.rmSync(tempDir, { recursive: true, force: true });
generateComponentSnippets();
generateExpressServerSnippet();
