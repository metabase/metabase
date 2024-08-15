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

export const getPackageVersion = async (packageName: string) => {
  try {
    const packagePath = path.join(
      process.cwd(),
      "node_modules",
      packageName,
      "package.json",
    );
    const packageJson = await fs.readFile(packagePath, "utf8");

    const packageInfo = JSON.parse(packageJson);
    return packageInfo.version || null;
  } catch (error) {
    if ((error as { code: string }).code === "ENOENT") {
      // Package not found
      return null;
    }
    console.error(
      `Error checking package version: ${
        (error as { message: string }).message
      }`,
    );
    return null;
  }
};
