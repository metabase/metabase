import type { PackageJson } from "@package-json/types";
import path from "path";

import { updateJsonFile } from "./file-utils";

export function updatePackageJsonFile(
  installationPath: string,
  updateFunction: (
    packageJsonContent: Partial<PackageJson>,
  ) => Partial<PackageJson>,
) {
  const packageJsonPath = path.join(installationPath, "package.json");

  updateJsonFile<PackageJson>(packageJsonPath, updateFunction);
}

export function updatePackageLockFile(
  installationPath: string,
  updateFunction: (
    packageLockContent: Record<string, any>,
  ) => Record<string, any>,
) {
  const packageLockPath = path.join(installationPath, "package-lock.json");

  updateJsonFile(packageLockPath, updateFunction);
}
