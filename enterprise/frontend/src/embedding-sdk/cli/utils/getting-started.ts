import fs from "fs/promises";

import { confirm } from "@inquirer/prompts";

import { getCodeSample } from "./code-sample";
import { printInfo } from "./print";

const INSTALL_SDK_MESSAGE = `
  Install the Metabase Embedding SDK for React on another terminal by running:
  npm install --save @metabase/embedding-sdk-react
`;

export async function showGettingStartedGuide(port: number) {
  const isSdkInPackageJson = await checkHasSdkInPackageJson();

  if (!isSdkInPackageJson) {
    printInfo(INSTALL_SDK_MESSAGE);
    console.log();
  }

  await confirm({ message: "Have you installed the SDK?", default: true });

  printInfo(`Next, paste the following code into your React application:`);

  const codeSample = getCodeSample(port);
  console.log(codeSample);

  await confirm({ message: "Have you pasted the code?", default: true });
}

export async function checkHasSdkInPackageJson() {
  const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
  const deps = packageJson.dependencies;

  return deps["@metabase/embedding-sdk-react"];
}
