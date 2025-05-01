import fs from "fs";

import glob from "glob";
import path from "path";

export const setupBanners = async ({ buildPath, getBanners }) => {
  await glob("./**/*.{js,mjs,cjs}", { cwd: buildPath }, (err, files) => {
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(buildPath, file), "utf8");
      const fileName = path.parse(file).name;

      const isMainBundle = fileName === "index";

      const banners = getBanners({ isMainBundle }).filter(Boolean).join("\n");

      fs.writeFileSync(path.join(buildPath, file), `${banners}${content}`);
    });
  });
};
