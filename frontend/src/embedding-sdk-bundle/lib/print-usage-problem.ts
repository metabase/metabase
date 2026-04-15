/* eslint-disable metabase/no-color-literals */

import { match } from "ts-pattern";

import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";

const HEADER_STYLE = "color: #509ee3; font-size: 16px; font-weight: bold;";
const TEXT_STYLE = "font-size: 14px;";
const LINK_STYLE =
  "color: #509ee3; font-size: 14px; text-decoration: underline;";

export function printUsageProblemToConsole(problem: SdkUsageProblem | null) {
  if (!problem) {
    return;
  }

  const logger = match(problem.severity)
    .with("warning", () => console.warn)
    .with("error", () => console.error)
    .exhaustive();

  const message =
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- console messages should not be white-labelled
    `%cMetabase modular embedding SDK for React\n\n` +
    `%c${problem.message}\n` +
    `See the documentation for more information:\n\n` +
    `%c${problem.documentationUrl}\n\n`;

  logger(message, HEADER_STYLE, TEXT_STYLE, LINK_STYLE);
}
