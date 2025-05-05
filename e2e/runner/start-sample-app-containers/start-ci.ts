import type { SampleAppTestSuiteName } from "../sample-apps-shared/types";

import { startSampleAppContainers } from "./startSampleAppContainers";

const testSuite = process.argv?.[2]?.trim() as SampleAppTestSuiteName;

if (!testSuite) {
  throw new Error("Test suite parameter is required");
}

startSampleAppContainers(testSuite);
