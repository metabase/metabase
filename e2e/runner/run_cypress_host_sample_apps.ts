import { FAILURE_EXIT_CODE, SUCCESS_EXIT_CODE } from "./constants/exit-code";
import runCypress from "./cypress-node-js-runner";
import { booleanify, printBold } from "./cypress-runner-utils";
import { startHostAppContainers } from "./embedding-sdk/host-apps/start-host-app-containers";
import { startSampleAppContainers } from "./embedding-sdk/sample-apps/start-sample-app-containers";
import { resolveSdkE2EConfig } from "./resolve-sdk-e2e-config";

// if you want to change these, set them as environment variables in your shell
const options = {
  SDK_TEST_SUITE: "vite-6-host-app-e2e", // one of the many sample-app, or host-app Embedding SDK suites
  CYPRESS_GUI: false,
  ...booleanify(process.env),
};

printBold(`Running Cypress with options:
  - SDK_TEST_SUITE       : ${options.SDK_TEST_SUITE}
  - CYPRESS_GUI          : ${options.CYPRESS_GUI}
`);

const init = async () => {
  switch (options.SDK_TEST_SUITE) {
    case "metabase-nodejs-react-sdk-embedding-sample-e2e":
    case "metabase-nextjs-sdk-embedding-sample-e2e":
    case "shoppy-e2e":
      await startSampleAppContainers(options.SDK_TEST_SUITE);
      break;

    case "vite-6-host-app-e2e":
    case "next-15-app-router-host-app-e2e":
    case "next-15-pages-router-host-app-e2e":
    case "angular-20-host-app-e2e":
      await startHostAppContainers(options.SDK_TEST_SUITE);
      break;
  }

  printBold("⏳ Starting Sample/Host App Cypress Tests");
  const config = resolveSdkE2EConfig(options.SDK_TEST_SUITE);
  await runCypress(config);
};

init()
  .then(() => process.exit(SUCCESS_EXIT_CODE))
  .catch((e) => {
    console.error(e);
    process.exit(FAILURE_EXIT_CODE);
  });
