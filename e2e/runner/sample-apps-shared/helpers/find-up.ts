import fs from "fs";

import path from "path";

export function findUp(
  fileNames: string[],
  { cwd, stopAt }: { cwd: string; stopAt: string },
): string | null {
  let currentPath = cwd;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const fileName of fileNames) {
      const filePath = path.join(currentPath, fileName);

      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    if (currentPath === stopAt) {
      break;
    }

    const nextPath = path.dirname(currentPath);

    if (nextPath === currentPath) {
      break;
    }

    currentPath = nextPath;
  }

  return null;
}
