import fs from "fs";

import path from "path";

import config from "../cypress-image-diff.config.js";

function approveDiff() {
  const basePathParts = path.resolve(
    import.meta.dirname,
    "..",
    config.ROOT_DIR,
    config.SCREENSHOTS_DIR,
  );

  const diffPath = path.join(basePathParts, "diff/chrome");
  const comparisonPath = path.join(basePathParts, "comparison/chrome");
  const baselinePath = path.join(basePathParts, "baseline/chrome");

  const diffExists = fs.existsSync(diffPath);

  if (!diffExists) {
    console.log("Looks like you don't have diff images to approve.");

    return;
  }

  const diffFiles = fs.readdirSync(diffPath);

  if (diffFiles.length) {
    diffFiles.forEach(diffFileName => {
      fs.copyFileSync(
        `${comparisonPath}/${diffFileName}`,
        `${baselinePath}/${diffFileName}`,
      );
    });
  } else {
    console.log(
      "No baselines to be updated. Make sure to run the visual tests before running update.",
    );
  }
}

approveDiff();
