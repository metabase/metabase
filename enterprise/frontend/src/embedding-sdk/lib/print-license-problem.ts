import { match } from "ts-pattern";

import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";

const HEADER_STYLE = "color: #509ee3; font-size: 16px; font-weight: bold;";
const TEXT_STYLE = "color: #333; font-size: 14px;";
const LINK_STYLE =
  "color: #509ee3; font-size: 14px; text-decoration: underline;";

export function printLicenseProblemToConsole(
  problem: SdkLicenseProblem | null,
  appName: string,
) {
  if (!problem) {
    return;
  }

  const logger = match(problem.severity)
    .with("warning", () => console.warn)
    .with("error", () => console.error)
    .exhaustive();

  logger(
    `%c${appName} Embedding SDK for React\n\n` +
      `%c${problem.message}\n` +
      `See the documentation for more information:\n\n` +
      `%chttps://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end\n\n`,
    HEADER_STYLE,
    TEXT_STYLE,
    LINK_STYLE,
  );
}
