// Node's module hooks: project files resolve and transform as jest's config
// says, mocked modules resolve to their stubs, and packages resolve with the
// conditions of jest's jsdom environment.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { root } from "../jest-config.ts";

import {
  isBypassingMocks,
  isMocked,
  isMockedBySetup,
  stubFileOf,
} from "./mocks.ts";
import {
  type ResolveContext,
  type ResolveResult,
  registerHooks,
} from "./node-loader.ts";
import { isProjectSource } from "./project.ts";
import { resolveProjectFile } from "./resolve.ts";
import { transform } from "./transform.ts";

// jest's jsdom environment resolves packages with these conditions. Node would
// use "node" and, for code it takes to be a module, "import", and so pick a
// different build of the same package.
const JEST_CONDITIONS = ["require", "default", "browser"];

const require = createRequire(import.meta.url);

// jest runs a package file as CommonJS unless the package is on its transform
// list, so a require() that lands on an ES module file of any other package
// fails there with a syntax error. Node can require such a file. The runner
// fails it too, because a spec can depend on a file being unimportable.
const transformedPackages = readTransformedPackages();
const packageTypes = new Map<string, string>();
const packageResolutions = new Map<string, ResolveResult>();
let mockResolutionDepth = 0;
let packageHoldsMock = false;

export function registerModuleHooks(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parentFile = parentFileOf(context);
      const result = resolveAny(specifier, context, parentFile, nextResolve);
      if (!isBypassingMocks()) {
        const stub = mockStubFor(result.url);
        if (stub) {
          notePackageHoldingMock(parentFile, result.url);
          return stub;
        }
      }
      // Only a require from project code is checked. The runner's own
      // packages, jsdom among them, load outside jest's module system and may
      // require anything. A mocked package never loads, and jest.mock itself
      // only asks for its path.
      if (
        mockResolutionDepth === 0 &&
        parentFile &&
        isProjectSource(parentFile)
      ) {
        refuseUntransformedModule(result, context);
      }
      return result;
    },
    load(url, context, nextLoad) {
      if (url.startsWith("file:")) {
        const file = fileURLToPath(url.split("?")[0]);
        if (isProjectSource(file)) {
          return {
            format: "commonjs",
            shortCircuit: true,
            source: transform(file),
          };
        }
      }
      return nextLoad(url, context);
    },
  });
}

/**
 * Resolves the way jest.mock does: without refusing ES module files, because a
 * mocked package never loads.
 */
export function resolveForMock(id: string, from: string): string {
  mockResolutionDepth += 1;
  try {
    return createRequire(from).resolve(id);
  } finally {
    mockResolutionDepth -= 1;
  }
}

function parentFileOf(context: ResolveContext): string | undefined {
  return context.parentURL?.startsWith("file:")
    ? fileURLToPath(context.parentURL.split("?")[0])
    : undefined;
}

function resolveAny(
  specifier: string,
  context: ResolveContext,
  parentFile: string | undefined,
  nextResolve: (specifier: string, context?: ResolveContext) => ResolveResult,
): ResolveResult {
  const isUrl = specifier.startsWith("file:") || specifier.startsWith("node:");
  const projectFile = isUrl ? null : resolveProjectFile(specifier, parentFile);
  if (projectFile) {
    return { url: pathToFileURL(projectFile).href, shortCircuit: true };
  }
  if (!parentFile) {
    return nextResolve(specifier, withJestConditions(context));
  }
  // Every spec file loads the project's modules again, and with them the same
  // package requests.
  const key = [
    specifier,
    path.dirname(parentFile),
    context.conditions?.join(","),
    JSON.stringify(context.importAttributes ?? {}),
  ].join("\0");
  let result = packageResolutions.get(key);
  if (!result) {
    result = {
      ...nextResolve(specifier, withJestConditions(context)),
      shortCircuit: true,
    };
    packageResolutions.set(key, result);
  }
  return result;
}

/**
 * Whether a package was handed a mock of the running spec file. A package
 * stays loaded for the life of the worker, so it would keep the mock for every
 * later file. jest loads packages again for each file, which scopes the mock.
 */
export function aPackageHoldsAMock(): boolean {
  return packageHoldsMock;
}

function notePackageHoldingMock(
  parentFile: string | undefined,
  mockedUrl: string,
): void {
  const mockedKey = mockedUrl.startsWith("file:")
    ? fileURLToPath(mockedUrl.split("?")[0])
    : mockedUrl;
  if (
    parentFile &&
    !isProjectSource(parentFile) &&
    !isMockedBySetup(mockedKey)
  ) {
    packageHoldsMock = true;
  }
}

function mockStubFor(url: string): ResolveResult | null {
  const key = url.startsWith("node:")
    ? url
    : url.startsWith("file:")
      ? fileURLToPath(url.split("?")[0])
      : null;
  if (!key || !isMocked(key)) {
    return null;
  }
  return {
    url: pathToFileURL(stubFileOf(key)).href,
    format: "commonjs",
    shortCircuit: true,
  };
}

// Only a require() is redirected. An import inside a package that is a real ES
// module keeps Node's conditions, because its named imports need a module
// build of what it imports.
function withJestConditions(context: ResolveContext): ResolveContext {
  return context.conditions?.includes("require")
    ? { ...context, conditions: JEST_CONDITIONS }
    : context;
}

function refuseUntransformedModule(
  result: ResolveResult,
  context: ResolveContext,
): void {
  if (
    !transformedPackages ||
    !context.conditions?.includes("require") ||
    !result.url.includes("/node_modules/")
  ) {
    return;
  }
  const packageMatch = result.url.match(
    /^(.*node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+))\//,
  );
  if (!packageMatch) {
    return;
  }
  const [, packageUrl, name] = packageMatch;
  if (transformedPackages.test(name.replace("/", "+"))) {
    return;
  }
  if (result.format !== "module" && !isModuleFile(result.url, packageUrl)) {
    return;
  }
  throw new SyntaxError(
    `Cannot use import statement outside a module (${name} is an ES module that jest does not transform)`,
  );
}

function isModuleFile(url: string, packageUrl: string): boolean {
  if (/\.mjs(\?|$)/.test(url)) {
    return true;
  }
  if (!/\.js(\?|$)/.test(url)) {
    return false;
  }
  let type = packageTypes.get(packageUrl);
  if (type === undefined) {
    type = readPackageType(packageUrl);
    packageTypes.set(packageUrl, type);
  }
  return type === "module";
}

function readPackageType(packageUrl: string): string {
  try {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(
        path.join(fileURLToPath(packageUrl), "package.json"),
        "utf8",
      ),
    );
    if (
      typeof manifest === "object" &&
      manifest !== null &&
      "type" in manifest &&
      typeof manifest.type === "string"
    ) {
      return manifest.type;
    }
  } catch {
    // A package without a readable manifest is CommonJS to Node as well.
  }
  return "commonjs";
}

function readTransformedPackages(): RegExp | null {
  const listFile = path.join(root, "jest.esm-packages.js");
  if (!fs.existsSync(listFile)) {
    return null;
  }
  const names: unknown = require(listFile);
  if (!Array.isArray(names)) {
    return null;
  }
  return new RegExp(`^(${names.join("|")})$`);
}
