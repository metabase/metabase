const path = require("path");
const glob = require("glob");

// Will match all files in the scenarios dir, except the helpers
const PATTERN = "frontend/test/metabase/scenarios/*/{*.js,!(helpers)/*.js}";

const invalidFileNames = glob.sync(PATTERN).filter(fullPath => {
  const basename = path.basename(fullPath);
  return !basename.endsWith(".cy.spec.js");
});

if (invalidFileNames.length > 0) {
  console.error(
    "Found Cypress files not ending with .cy.spec.js:\n\n",
    invalidFileNames.join("\n"),
  );
  return 1;
}

return 0;
