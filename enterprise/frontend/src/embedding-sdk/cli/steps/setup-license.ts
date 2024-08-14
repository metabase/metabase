import { input } from "@inquirer/prompts";
import chalk from "chalk";
import toggle from "inquirer-toggle";
import open from "open";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

import { printEmptyLines, printInfo } from "../utils/print";
import { propagateErrorResponse } from "../utils/propagate-error-response";

const trialUrl = `https://store.metabase.com/checkout?plan=pro&deployment=self-hosted`;
const trialUrlWithUtm = `${trialUrl}&utm_source=product&utm_medium=checkout&utm_campaign=embedding-sdk&utm_content=embedding-sdk-cli`;

export const setupLicense: CliStepMethod = async state => {
  const hasLicenseKey = await toggle({
    message: "Do you already have a Metabase Pro license key?",
    default: false,
  });

  if (!hasLicenseKey) {
    printEmptyLines(1);
    console.log(
      `  Please sign up for a free trial of Metabase Pro self-hosted or purchase a license.`,
    );

    const shouldOpenInBrowser = await toggle({
      message: `Open the store to get a license key?`,
      default: true,
    });

    if (shouldOpenInBrowser) {
      try {
        await open(trialUrlWithUtm);
        console.log(`  Opened ${chalk.blue(trialUrl)} in your browser.`);
      } catch (error) {
        printInfo(`Please visit ${chalk.blue(trialUrl)} to get a license key.`);
      }
    }
  }

  const token = await input({
    message: "Enter your Metabase Pro license key:",
    required: true,
  });

  // Activate the license
  try {
    const res = await fetch(
      `${state.instanceUrl}/api/setting/premium-embedding-token`,
      {
        method: "PUT",
        body: JSON.stringify({
          value: token.trim(),
        }),
        headers: { "content-type": "json", cookie: state.cookie ?? "" },
      },
    );

    await propagateErrorResponse(res);

    return [{ type: "success" }, { ...state, token }];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Failed to activate license. Reason: ${reason}`;

    return [{ type: "error", message }, state];
  }
};
