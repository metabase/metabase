import fs from "fs/promises";

import { confirm, input } from "@inquirer/prompts";

import { createApiKey } from "../utils/create-api-key";
import {
  checkIsDockerRunning,
  startLocalMetabaseContainer,
} from "../utils/docker";
import { generateRandomDemoPassword } from "../utils/generate-password";
import { showGettingStartedGuide } from "../utils/getting-started";
import { pollUntilMetabaseInstanceReady } from "../utils/health-check";
import { checkInReactProject } from "../utils/is-in-react-project";
import { printError } from "../utils/print";
import {
  DELETE_CONTAINER_MESSAGE,
  setupMetabaseInstance,
} from "../utils/setup-metabase-instance";

const START_MESSAGE = `
  This command will help you bootstrap a local Metabase instance and embed
  analytics into your React app using the Metabase Embedding SDK.
`;

const DOCKER_NOT_RUNNING_MESSAGE = `
  Docker is not running. Please install and start the Docker daemon before running this command.
  For more information, see https://docs.docker.com/engine/install
`;

const INSTANCE_NOT_READY_ERROR = `
  Could not connect to your local Metabase instance.
  ${DELETE_CONTAINER_MESSAGE}
`;

const isEmail = (email: string) => email.match(/^\S+@\S+\.\S+$/) !== null;

export async function start() {
  try {
    console.log(START_MESSAGE);

    const isInReactProject = await checkInReactProject();

    if (!isInReactProject) {
      return;
    }

    const shouldStart = await confirm({ message: "Continue?" });

    if (!shouldStart) {
      printError("Aborted.");
      return;
    }

    const isDockerRunning = await checkIsDockerRunning();

    if (!isDockerRunning) {
      printError(DOCKER_NOT_RUNNING_MESSAGE);
      return;
    }

    const email = await input({
      message: "What is the email address you want to use for the admin user?",
      validate: isEmail,
    });

    const password = generateRandomDemoPassword();

    // Store the login credentials to a file.
    await fs.writeFile(
      "./METABASE_LOGIN.txt",
      `Email: ${email}\nPassword: ${password}`,
    );

    const port = await startLocalMetabaseContainer();

    if (!port) {
      return;
    }

    const instanceUrl = `http://localhost:${port}`;

    const instanceReady = await pollUntilMetabaseInstanceReady(instanceUrl);

    if (!instanceReady) {
      printError(INSTANCE_NOT_READY_ERROR);

      return;
    }

    const setupResult = await setupMetabaseInstance({
      email,
      password,
      instanceUrl,
    });

    if (!setupResult) {
      return;
    }

    const { cookie } = setupResult;

    const apiKey = await createApiKey({ instanceUrl, cookie });

    if (!apiKey) {
      return;
    }

    await showGettingStartedGuide(port, apiKey);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("force closed the prompt")) {
        printError("Aborted.");
        return;
      }
    }

    printError("An error occurred.");
    console.log(error);
  }
}
