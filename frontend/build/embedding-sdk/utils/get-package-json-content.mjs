import fs from "fs";
import path from "path";

export function getPackageJsonContent() {
  const mainPackageJson = fs.readFileSync(
    path.resolve("./package.json"),
    "utf-8",
  );

  return JSON.parse(mainPackageJson);
}
