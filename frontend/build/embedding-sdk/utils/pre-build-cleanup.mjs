import fs from "fs";

export const preBuildCleanup = ({ buildPath }) => {
  fs.rmSync(buildPath, {
    force: true,
    recursive: true,
  });
};
