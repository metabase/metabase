import fs from "fs/promises";

import path from "path";

export const hasPackageJson = async () => {
  try {
    await fs.access("package.json");
    return true;
  } catch (error) {
    return false;
  }
};

type DependencyMap = Record<string, string>;

export const getPackageVersions = async (...packageNames: string[]) => {
  const versions: Record<string, string> = {};

  const projectDeps = await getProjectDependenciesFromPackageJson();

  for (const name of packageNames) {
    versions[name] =
      (await getPackageVersionFromModule(name)) || projectDeps?.[name] || null;
  }

  return versions;
};

export const readJson = async (path: string) => {
  const packageJson = await fs.readFile(path, "utf8");

  return JSON.parse(packageJson);
};

export const getProjectDependenciesFromPackageJson = async (
  field: "dependencies" | "devDependencies" = "dependencies",
): Promise<DependencyMap | null> => {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageInfo = await readJson(packageJsonPath);

    return packageInfo?.[field] || null;
  } catch (error) {
    return null;
  }
};

export const getPackageVersionFromModule = async (packageName: string) => {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      "node_modules",
      packageName,
      "package.json",
    );

    const packageInfo = await readJson(packageJsonPath);

    return packageInfo.version || null;
  } catch (error) {
    return null;
  }
};
