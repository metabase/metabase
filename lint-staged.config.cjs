module.exports = {
  "+(frontend|enterprise)/**/*.styled.tsx": [
    "stylelint --customSyntax postcss-styled-syntax --fix",
  ],
  "+(frontend|enterprise/frontend|e2e)/**/*.css": [
    "stylelint --fix",
    "prettier --write",
  ],
  "+(frontend|enterprise/frontend)/**/*.{js,jsx,ts,tsx}": [
    "cross-env LINT_CSS_MODULES=true eslint --max-warnings 0 --fix",
    "prettier --write",
    "node ./bin/verify-doc-links",
  ],
  "e2e/**/!(cypress_sample_instance_data).{js,jsx,ts,jsx}": [
    "eslint --max-warnings 0 --fix",
    "prettier --write",
  ],
  "**/*.{clj,cljc,cljs,bb}": [
    "./bin/mage cljfmt-files",
    "./bin/mage fix-unused-requires",
  ],
  "e2e/test/scenarios/*/{*.(js|ts),!(helpers|shared)/*.(js|ts)}": [
    "node e2e/validate-e2e-test-files.js",
  ],
  "enterprise/frontend/src/embedding-sdk-package/README.md": [
    "prettier --write",
  ],
  "+(.storybook|enterprise/frontend/src/embedding-sdk-shared/.storybook)/**/*.{js,jsx,ts,tsx,css}":
    ["prettier --write"],
  "**/*": [
    /**
     * Run mage token-scan for each staged file individually.
     * lint-staged passes staged file paths as an array, but executing the command
     * once per file avoids shell parsing issues with paths containing spaces or
     * special characters (e.g. parentheses), and keeps the invocation explicit.
     */
    (files) =>
      `./bin/mage -token-scan ${files.map((item) => `"${item}"`).join(" ")}`,
    // TODO (Bryan 12/12/25) -- reenable this when we can completely verify correctness
    "./bin/mage -uninstall-merge-drivers",
  ],
};
