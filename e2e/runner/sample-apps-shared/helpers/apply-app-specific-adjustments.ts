import type { SampleAppFramework } from "../types";

import { applyNextJsAdjustments } from "./apply-nextjs-adjustments";

export function applyAppSpecificAdjustments({
  framework,
  installationPath,
  loggerPrefix,
}: {
  framework: SampleAppFramework;
  installationPath: string;
  loggerPrefix: string;
}) {
  switch (framework) {
    case "next":
      applyNextJsAdjustments({ installationPath, loggerPrefix });
      break;
    case "vite":
      break;
  }
}
