import path from "path";

import glob from "glob";

import { updateChunkContentAndSourceMap } from "./update-chunk-content-and-source-map.mjs";

export const setupBanners = async ({ buildPath, getBanners }) => {
  await glob("./**/*.{js,mjs,cjs}", { cwd: buildPath }, (err, files) => {
    files.forEach((file) => {
      const fileName = path.parse(file).name;
      const isMainBundle = fileName === "index";

      const banners = getBanners({ isMainBundle }).filter(Boolean).join("\n");

      updateChunkContentAndSourceMap(
        path.join(buildPath, file),
        (content) => `${banners}${content}`,
      );
    });
  });
};
