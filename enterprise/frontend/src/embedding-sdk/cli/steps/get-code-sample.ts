import clipboard from "clipboardy";
import toggle from "inquirer-toggle";

import { getCodeSample } from "embedding-sdk/cli/constants/code-sample";
import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import {
  printEmptyLines,
  printInfo,
  printSuccess,
} from "embedding-sdk/cli/utils/print";

export const generateCodeSample: CliStepMethod = async state => {
  if (!state.instanceUrl || !state.apiKey) {
    return [
      {
        type: "error",
        message: "Missing instance URL or API key",
      },
      state,
    ];
  }

  printEmptyLines(2);
  printSuccess(
    "API key generated successfully. Here's a code sample to embed the Metabase SDK in your React application:",
  );

  const codeSample = getCodeSample(state.instanceUrl, state.apiKey);
  printEmptyLines();
  printInfo(codeSample.trim());
  printEmptyLines();

  const shouldCopyToClipboard = await toggle({
    message: "Would you like to copy the code to your clipboard?",
    default: true,
  });

  if (shouldCopyToClipboard) {
    await clipboard.write(codeSample);
    printSuccess(
      "Code copied to clipboard. Paste it into your React application.",
    );
  } else {
    printSuccess(
      "Paste the code above into your React application to embed Metabase.",
    );
    printInfo(
      "Then, put <Analytics /> in your component to view the dashboard!",
    );
  }
  return [
    {
      type: "done",
    },
    state,
  ];
};
