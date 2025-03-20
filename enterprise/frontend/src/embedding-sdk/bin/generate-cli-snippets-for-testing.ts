#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs";

import path from "path";

import { MOCK_SERVER_PACKAGE_JSON } from "../cli/constants/mock-server-package-json";
import { getExpressServerSnippet } from "../cli/snippets/express-server-snippet";
import { getComponentSnippets } from "../cli/snippets/get-component-snippets";
import {
  getNextJsAnalyticsPageSnippet,
  getNextJsPagesWrapperOrAppWrapperSnippet,
} from "../cli/snippets/nextjs-snippets";

function installDependencies(tempDir: string) {
  execSync("yarn", { cwd: tempDir, stdio: "inherit" });
}

function setupOutDir(outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
}

const cwd = path.join(__dirname, "..");
const tempDir = path.join(cwd, "cli-snippets-tmp");

const generateComponentSnippets = ({
  folderName,
  userSwitcherEnabled,
  generateAdditionalComponents,
}: {
  folderName: string;
  userSwitcherEnabled: boolean;
  generateAdditionalComponents?: (data: { outDir: string }) => void;
}) => {
  const outDir = path.join(tempDir, folderName);

  setupOutDir(outDir);

  const snippets = getComponentSnippets({
    instanceUrl: "https://example.com",
    apiKey: "key",
    dashboards: [{ id: 1, name: "Test dashboard" }],
    userSwitcherEnabled,
    isNextJs: false,
  });
  const nextJsAnalyticsPageSnippetContent = getNextJsAnalyticsPageSnippet({
    resolveImport: path => `./${path}`,
  });
  const nextJsPagesWrapperSnippetContent =
    getNextJsPagesWrapperOrAppWrapperSnippet({
      router: "pages",
      resolveImport: path => `./${path}`,
    });
  const nextJsAppWrapperSnippetContent =
    getNextJsPagesWrapperOrAppWrapperSnippet({
      router: "app",
      resolveImport: path => `./${path}`,
    });

  for (const { fileName, content } of snippets) {
    const filePath = path.join(outDir, `${fileName}.jsx`);
    fs.writeFileSync(filePath, content, "utf8");
  }

  generateAdditionalComponents?.({ outDir });

  fs.writeFileSync(
    path.join(outDir, "analytics-page.tsx"),
    nextJsAnalyticsPageSnippetContent,
    "utf8",
  );

  fs.writeFileSync(
    path.join(outDir, "pages-wrapper-page.tsx"),
    nextJsPagesWrapperSnippetContent,
    "utf8",
  );

  fs.writeFileSync(
    path.join(outDir, "app-wrapper-page.tsx"),
    nextJsAppWrapperSnippetContent,
    "utf8",
  );
};

const generateNextJsSnippets = ({ folderName }: { folderName: string }) => {
  const nextJsAnalyticsPageSnippetContent = getNextJsAnalyticsPageSnippet({
    resolveImport: path => `./${path}`,
  });
  const nextJsPagesWrapperSnippetContent =
    getNextJsPagesWrapperOrAppWrapperSnippet({
      router: "pages",
      resolveImport: path => `./${path}`,
    });
  const nextJsAppWrapperSnippetContent =
    getNextJsPagesWrapperOrAppWrapperSnippet({
      router: "app",
      resolveImport: path => `./${path}`,
    });

  generateComponentSnippets({
    folderName,
    userSwitcherEnabled: false,
    generateAdditionalComponents: ({ outDir }) => {
      fs.writeFileSync(
        path.join(outDir, "analytics-page.tsx"),
        nextJsAnalyticsPageSnippetContent,
        "utf8",
      );

      fs.writeFileSync(
        path.join(outDir, "pages-wrapper-page.tsx"),
        nextJsPagesWrapperSnippetContent,
        "utf8",
      );

      fs.writeFileSync(
        path.join(outDir, "app-wrapper-page.tsx"),
        nextJsAppWrapperSnippetContent,
        "utf8",
      );
    },
  });
};

const generateExpressServerSnippet = ({
  folderName,
}: {
  folderName: string;
}) => {
  const outDir = path.join(tempDir, folderName);

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

const generate = () => {
  fs.rmSync(tempDir, { recursive: true, force: true });

  generateComponentSnippets({
    folderName: "component-snippets-user-switcher-enabled",
    userSwitcherEnabled: true,
  });

  generateComponentSnippets({
    folderName: "component-snippets-user-switcher-disabled",
    userSwitcherEnabled: false,
  });

  generateNextJsSnippets({
    folderName: "nextjs-snippets",
  });

  generateExpressServerSnippet({
    folderName: "express-server",
  });
};

generate();
