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

export const getDependenciesFromPackageJson =
  async (): Promise<DependencyMap | null> => {
    try {
      const packagePath = path.join(process.cwd(), "package.json");
      const packageJson = await fs.readFile(packagePath, "utf8");

      const packageInfo = JSON.parse(packageJson);

      return packageInfo?.dependencies || null;
    } catch (error) {
      if ((error as { code: string }).code === "ENOENT") {
        // Package not found
        return null;
      }

      console.error(
        `Error accessing package.json: ${(error as { message: string }).message}`,
      );

      return null;
    }
  };
