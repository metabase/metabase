import { execSync } from "child_process";
import * as fs from "fs";

import * as path from "path";

import { MOCK_SERVER_PACKAGE_JSON } from "embedding-sdk/cli/constants/mock-server-package-json";
import { getExpressServerSnippet } from "embedding-sdk/cli/snippets";

import { getComponentSnippets } from "../get-component-snippets";

const installDependencies = (tempDir: string) => {
  execSync("yarn", {
    cwd: tempDir,
  });
};

const typeCheck = (tscPath: string) => {
  execSync(`"${tscPath}" --project tsconfig.snippets.json --noEmit`, {
    cwd: __dirname,
    encoding: "utf-8",
  });
};

jest.setTimeout(120 * 1000);

describe("Embedding CLI snippets", () => {
  const tempDir: string = path.join(__dirname, "tmp");

  const typescriptPackageDir = path.dirname(
    require.resolve("typescript/package.json"),
  );
  const tscPath = path.join(typescriptPackageDir, "../.bin/tsc");

  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir);
  });

  describe.each([
    {
      userSwitcherEnabled: false,
    },
    {
      userSwitcherEnabled: true,
    },
  ])("React component snippets", ({ userSwitcherEnabled }) => {
    beforeEach(() => {
      const snippets = getComponentSnippets({
        instanceUrl: "https://example.com",
        apiKey: "key",
        dashboards: [{ id: "1", name: "Test dashboard" }],
        userSwitcherEnabled,
        isNextJs: false,
      });

      for (const { fileName, content } of snippets) {
        const filePath = path.join(tempDir, `${fileName}.jsx`);

        fs.writeFileSync(filePath, content, "utf8");
      }
    });

    it("should have no type errors for snippets", () => {
      let errors: unknown | null = null;

      try {
        typeCheck(tscPath);
      } catch (error: any) {
        errors = error.output || error.message;
      }

      expect(errors).toBeNull();
    });
  });

  describe("Express.js snippet", () => {
    beforeEach(() => {
      const snippetContent = getExpressServerSnippet({
        instanceUrl: "https://example.com",
        tenantIdsMap: {},
      });
      const packageJsonContent = JSON.stringify(
        MOCK_SERVER_PACKAGE_JSON,
        null,
        2,
      );

      const snippetFilePath = path.join(tempDir, `server.js`);
      const packageJsonFilePath = path.join(tempDir, `package.json`);

      fs.writeFileSync(snippetFilePath, snippetContent, "utf8");
      fs.writeFileSync(packageJsonFilePath, packageJsonContent);

      installDependencies(tempDir);
    });

    it("should have no type errors for the snippet", () => {
      let errors: unknown | null = null;

      try {
        typeCheck(tscPath);
      } catch (error: any) {
        errors = error.output || error.message;
      }

      expect(errors).toBeNull();
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
