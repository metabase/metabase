import fs from "fs";
import path from "path";

jest.mock("fs");

describe("SDK package generation", () => {
  it("publishes only esbuild and typescript as CLI runtime dependencies", async () => {
    const repositoryManifest = {
      dependencies: { typescript: "6.0.3", react: "19.0.0" },
      devDependencies: { esbuild: "0.28.1", jest: "30.0.0" },
    };

    jest.mocked(fs.readFileSync).mockImplementation((filename) => {
      if (filename === path.resolve("package.json")) {
        return JSON.stringify(repositoryManifest);
      }

      return JSON.stringify({ version: "1.0.0" });
    });

    await jest.isolateModulesAsync(async () => {
      await import("../../../../../bin/embedding-sdk/generate-sdk-package-files.js");
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.resolve("resources/embedding-sdk/package.json"),
      expect.any(String),
      "utf-8",
    );

    const packageJsonPath = path.resolve(
      "resources/embedding-sdk/package.json",
    );

    const [, manifest] = jest
      .mocked(fs.writeFileSync)
      .mock.calls.find(([filename]) => filename === packageJsonPath)!;

    expect(JSON.parse(String(manifest)).dependencies).toStrictEqual({
      esbuild: "0.28.1",
      typescript: "6.0.3",
    });
  });
});
