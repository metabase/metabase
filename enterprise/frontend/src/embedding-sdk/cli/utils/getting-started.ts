import fs from "fs/promises";

import { confirm } from "@inquirer/prompts";

import { getCodeSample } from "./code-sample";
import { CONTAINER_NAME } from "./constants";
import { printInfo } from "./print";

const INSTALL_SDK_MESSAGE = `
  Install the npm package on another terminal by running:
  npm install --save @metabase/embedding-sdk-react
`;

const DOCS_MESSAGE = `
  Metabase is running in a Docker container. To stop it, run "docker stop ${CONTAINER_NAME}".
  Documentation for the SDK can be found here: https://www.npmjs.com/package/@metabase/embedding-sdk-react

  Anonymous usage statistics are enabled. You can disable this in the instance settings.

  Thank you for trying out Metabase Embedding SDK for React.
`;

/**
 * If the user answers "no" to the prompt, they will be asked again.
 * Hitting "Enter" will confirm by default.
 **/
const confirmStep = async (message: string) => {
  let confirmed = false;

  do {
    confirmed = await confirm({ message });
  } while (!confirmed);
};

export async function showGettingStartedGuide(port: number, apiKey: string) {
  const isSdkInPackageJson = await checkHasSdkInPackageJson();

  if (!isSdkInPackageJson) {
    printInfo(INSTALL_SDK_MESSAGE);
  }

  await confirmStep("Have you installed the SDK?");

  printInfo(`Next, paste the following code into your React application:`);

  const instanceUrl = `http://localhost:${port}`;

  const codeSample = getCodeSample(instanceUrl, apiKey);
  console.log("\n" + codeSample.trim());

  printInfo("Please paste the code above in your application.\n");

  await confirmStep("Have you pasted the code?");

  printInfo(DOCS_MESSAGE);
}

export async function checkHasSdkInPackageJson() {
  const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
  const deps = packageJson.dependencies;

  return deps["@metabase/embedding-sdk-react"];
}
