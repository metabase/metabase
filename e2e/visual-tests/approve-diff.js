const fs = require("fs");

const path = require("path");

const config = require("../support/cypress-image-diff.config.js");

function approveDiff() {
  const basePathParts = path.resolve(
    __dirname,
    config.ROOT_DIR,
    config.SCREENSHOTS_DIR,
  );

  const diffPath = path.join(basePathParts, "diff");
  const comparisonPath = path.join(basePathParts, "comparison");
  const baselinePath = path.join(basePathParts, "baseline");

  const diffExists = fs.existsSync(diffPath);

  if (!diffExists) {
    console.log(
      `Looks like you don't have diff images to approve. Path: ${diffPath}`,
    );

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

    console.log(
      "Baselines were updated. Make sure to commit the changes to the repository.",
    );
  } else {
    console.log("No baselines to be updated.");
  }
}

approveDiff();
