import fs from "fs";
import os from "os";
import path from "path";

import { CssVarsDeclarationPlugin } from "./css-vars-declaration-plugin";

interface CssVarConfig {
  path: string;
  staticVars?: string[];
  sources?: Array<{
    file?: string;
    type: "objectKeys" | "unionType";
    names: string[];
    varPrefix?: string;
  }>;
}

/** Create a temp directory with a tsconfig.json and the given source files. */
function createFixture(files: Record<string, string>) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "css-vars-test-"));
  const srcDir = path.join(rootDir, "src");

  fs.writeFileSync(
    path.join(rootDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true } }),
  );

  for (const [relPath, content] of Object.entries(files)) {
    const filePath = path.join(srcDir, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return { rootDir, srcDir };
}

function readOutput(srcDir: string, configPath: string) {
  const outputPath = path.join(srcDir, configPath.replace(/\.ts$/, ".d.css"));
  return fs.readFileSync(outputPath, "utf-8");
}

function runPlugin({
  configs,
  files,
}: {
  configs: CssVarConfig[];
  files: Record<string, string>;
}) {
  const { rootDir, srcDir } = createFixture(files);

  const plugin = new CssVarsDeclarationPlugin({
    frontendSrcPath: srcDir,
    rootPath: rootDir,
    configs,
  });

  const tapCallback = jest.fn();
  const mockCompiler = {
    hooks: {
      environment: {
        tap: (_name: string, fn: () => void) =>
          tapCallback.mockImplementation(fn),
      },
    },
  };

  plugin.apply(mockCompiler as any);
  tapCallback();

  return { srcDir };
}

describe("CssVarsDeclarationPlugin", () => {
  describe("objectKeys extraction", () => {
    it("extracts --mb-* keys from a plain object", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export const MY_VARS = {
              "--mb-color-bg": "colors.bg",
              "--mb-color-fg": "colors.fg",
              "not-a-css-var": "ignored",
            };
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["MY_VARS"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-color-bg: ;");
      expect(output).toContain("--mb-color-fg: ;");
      expect(output).not.toContain("not-a-css-var");
    });

    it("extracts keys from objects with satisfies expression", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            type ThemeMap = Record<string, string>;
            export const MY_VARS = {
              "--mb-overlay-z-index": "zIndex",
            } satisfies ThemeMap;
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["MY_VARS"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-overlay-z-index: ;");
    });

    it("extracts keys from objects with as const expression", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export const MY_VARS = {
              "--mb-font-size": "fontSize",
            } as const;
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["MY_VARS"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-font-size: ;");
    });

    it("extracts from multiple variables in the same file", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export const MAP_A = { "--mb-a": "a" };
            export const MAP_B = { "--mb-b": "b" };
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["MAP_A", "MAP_B"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-a: ;");
      expect(output).toContain("--mb-b: ;");
    });
  });

  describe("unionType extraction", () => {
    it("extracts string literals from a union type", () => {
      const configPath = "types/keys.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export type ColorKey = "brand" | "danger" | "success";
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [
              {
                type: "unionType",
                names: ["ColorKey"],
                varPrefix: "--mb-color-",
              },
            ],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-color-brand: ;");
      expect(output).toContain("--mb-color-danger: ;");
      expect(output).toContain("--mb-color-success: ;");
    });

    it("resolves nested type references in union types", () => {
      const configPath = "types/keys.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            type Nested = "nested-a" | "nested-b";
            export type All = Nested | "direct";
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "unionType", names: ["All"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("nested-a: ;");
      expect(output).toContain("nested-b: ;");
      expect(output).toContain("direct: ;");
    });

    it("resolves indexed access types like (typeof arr)[number]", () => {
      const configPath = "types/keys.ts";
      const { srcDir } = runPlugin({
        files: {
          "constants/names.ts": `
            export const ALL_NAMES = ["alpha", "beta", "gamma"] as const;
          `,
          [configPath]: `
            import type { ALL_NAMES } from "../constants/names";
            export type NameKey = (typeof ALL_NAMES)[number];
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [
              {
                type: "unionType",
                names: ["NameKey"],
                varPrefix: "--mb-",
              },
            ],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-alpha: ;");
      expect(output).toContain("--mb-beta: ;");
      expect(output).toContain("--mb-gamma: ;");
    });

    it("resolves deeply nested union with mixed type references and indexed access", () => {
      const configPath = "types/all.ts";
      const { srcDir } = runPlugin({
        files: {
          "constants/accents.ts": `
            export const ACCENT_NAMES = ["accent0", "accent1"] as const;
          `,
          [configPath]: `
            import type { ACCENT_NAMES } from "../constants/accents";
            type AccentKey = (typeof ACCENT_NAMES)[number];
            type ProtectedKey = "admin" | "internal";
            export type AllKeys = AccentKey | ProtectedKey | "brand";
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [
              {
                type: "unionType",
                names: ["AllKeys"],
                varPrefix: "--mb-color-",
              },
            ],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-color-accent0: ;");
      expect(output).toContain("--mb-color-accent1: ;");
      expect(output).toContain("--mb-color-admin: ;");
      expect(output).toContain("--mb-color-internal: ;");
      expect(output).toContain("--mb-color-brand: ;");
    });
  });

  describe("staticVars", () => {
    it("includes static variables without any sources", () => {
      const configPath = "theme/static.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `export default {};`,
        },
        configs: [
          {
            path: configPath,
            staticVars: ["--mb-font-family", "--mb-font-mono"],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-font-family: ;");
      expect(output).toContain("--mb-font-mono: ;");
    });

    it("combines static variables with extracted sources", () => {
      const configPath = "theme/combined.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export const VARS = { "--mb-dynamic": "val" };
          `,
        },
        configs: [
          {
            path: configPath,
            staticVars: ["--mb-static"],
            sources: [{ type: "objectKeys", names: ["VARS"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-static: ;");
      expect(output).toContain("--mb-dynamic: ;");
    });
  });

  describe("source file override", () => {
    it("reads from a different file when source.file is specified", () => {
      const configPath = "theme/output.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `export default {};`,
          "other/source.ts": `
            export type Keys = "a" | "b";
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [
              {
                file: "other/source.ts",
                type: "unionType",
                names: ["Keys"],
                varPrefix: "--mb-",
              },
            ],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toContain("--mb-a: ;");
      expect(output).toContain("--mb-b: ;");
    });
  });

  describe("output format", () => {
    it("sorts variables alphabetically", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: {
          [configPath]: `
            export const VARS = {
              "--mb-z-var": "z",
              "--mb-a-var": "a",
              "--mb-m-var": "m",
            };
          `,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["VARS"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      const lines = output.split("\n").filter((l) => l.includes("--mb-"));
      expect(lines[0]).toContain("--mb-a-var");
      expect(lines[1]).toContain("--mb-m-var");
      expect(lines[2]).toContain("--mb-z-var");
    });

    it("includes the auto-generated header comment", () => {
      const configPath = "theme/vars.ts";
      const { srcDir } = runPlugin({
        files: { [configPath]: `export const V = { "--mb-x": "x" };` },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["V"] }],
          },
        ],
      });

      const output = readOutput(srcDir, configPath);
      expect(output).toMatch(
        /^\/\* Auto-generated by CssVarsDeclarationPlugin/,
      );
    });
  });

  describe("warnings", () => {
    it("warns when a source file does not exist", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const configPath = "theme/output.ts";
      runPlugin({
        files: {
          [configPath]: `export default {};`,
        },
        configs: [
          {
            path: configPath,
            sources: [
              {
                file: "nonexistent/file.ts",
                type: "objectKeys",
                names: ["VARS"],
              },
            ],
          },
        ],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Source file not found: nonexistent/file.ts"),
      );
      warnSpy.mockRestore();
    });

    it("warns when a variable name is not found in the source file", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const configPath = "theme/vars.ts";
      runPlugin({
        files: {
          [configPath]: `export const OTHER = { "--mb-x": "x" };`,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "objectKeys", names: ["MISSING_VAR"] }],
          },
        ],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Variable "MISSING_VAR" not found'),
      );
      warnSpy.mockRestore();
    });

    it("warns when a type alias is not found in the source file", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const configPath = "types/keys.ts";
      runPlugin({
        files: {
          [configPath]: `export type Other = "a";`,
        },
        configs: [
          {
            path: configPath,
            sources: [{ type: "unionType", names: ["MissingType"] }],
          },
        ],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Type alias "MissingType" not found'),
      );
      warnSpy.mockRestore();
    });
  });

  describe("compiler hook", () => {
    it("registers on the environment hook", () => {
      const plugin = new CssVarsDeclarationPlugin({
        frontendSrcPath: "/tmp",
        rootPath: "/tmp",
        configs: [],
      });

      const tapFn = jest.fn();
      const mockCompiler = {
        hooks: { environment: { tap: tapFn } },
      };

      plugin.apply(mockCompiler as any);
      expect(tapFn).toHaveBeenCalledWith(
        "CssVarsDeclarationPlugin",
        expect.any(Function),
      );
    });
  });
});
