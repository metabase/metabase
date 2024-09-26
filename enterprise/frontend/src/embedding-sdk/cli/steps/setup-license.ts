import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import toggle from "inquirer-toggle";
import open from "open";
import ora from "ora";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

import { SETUP_PRO_LICENSE_MESSAGE } from "../constants/messages";
import { printEmptyLines, printWithPadding } from "../utils/print";
import { propagateErrorResponse } from "../utils/propagate-error-response";

const trialUrl = `https://store.metabase.com/checkout?plan=pro&deployment=self-hosted`;
const trialUrlWithUtm = `${trialUrl}&utm_source=product&utm_medium=checkout&utm_campaign=embedding-sdk&utm_content=embedding-sdk-cli`;

const VISIT_STORE_MESSAGE = `Please visit ${chalk.blue(
  trialUrl,
)} to get a license key.`;

export const setupLicense: CliStepMethod = async state => {
  printWithPadding(SETUP_PRO_LICENSE_MESSAGE);

  const shouldSetupLicense = await toggle({
    message: "Do you want to set up a Pro license?",
    default: true,
  });

  if (!shouldSetupLicense) {
    return [{ type: "success" }, state];
  }

  const hasLicenseKey = await toggle({
    message: "Do you already have a Metabase Pro or Enterprise license key?",
    default: false,
  });

  if (!hasLicenseKey) {
    printEmptyLines(1);
    printWithPadding(
      `Please sign up for a free trial of Metabase Pro self-hosted or purchase a license.`,
    );

    const shouldOpenInBrowser = await toggle({
      message: `Open the store to get a license key?`,
      default: true,
    });

    if (shouldOpenInBrowser) {
      try {
        await open(trialUrlWithUtm);
        printWithPadding(`Opened ${chalk.blue(trialUrl)} in your browser.`);
      } catch (error) {
        printWithPadding(VISIT_STORE_MESSAGE);
      }
    } else {
      printWithPadding(VISIT_STORE_MESSAGE);
    }
  }

  const spinner = ora();

  // Activate the license
  // eslint-disable-next-line no-constant-condition -- ask until user provides a valid license key
  while (true) {
    try {
      const token = await input({
        message: "Enter your Metabase Pro license key:",
        required: true,
        validate: value => {
          if (value.length !== 64 || !/^[0-9A-Fa-f]+$/.test(value)) {
            return "License key must be a 64-character hexadecimal string.";
          }

          return true;
        },
      });

      spinner.start("Activating the license...");

      const endpoint = `${state.instanceUrl}/api/setting/premium-embedding-token`;

      const res = await fetch(endpoint, {
        method: "PUT",
        body: JSON.stringify({ value: token.trim() }),
        headers: {
          "content-type": "application/json",
          cookie: state.cookie ?? "",
        },
      });

      await propagateErrorResponse(res);

      spinner.succeed();

      return [{ type: "success" }, { ...state, token }];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      spinner.fail();

      printWithPadding(
        chalk.red(`Failed to activate license. Reason: ${reason}`),
      );

      const skipLicenseSetup = await select({
        message: `Do you want to try another license key?`,
        choices: [
          { name: "Try another license key.", value: false },
          { name: "I'll activate the license later.", value: true },
        ],
      });

      if (skipLicenseSetup) {
        return [{ type: "success" }, state];
      }
    }
  }
};
