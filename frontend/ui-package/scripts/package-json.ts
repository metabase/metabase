import { readFileSync } from "fs";

type Deps = Record<string, string>;

export interface PackageJson {
  dependencies?: Deps;
  devDependencies?: Deps;
  peerDependencies?: Deps;
  sideEffects?: string[];
}

export function readPackageJson(file: string): PackageJson {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${file} is not a JSON object`);
  }
  return parsed;
}
