import { startSampleAppContainers } from "./start-sample-app-containers";
import type { SampleAppTestSuiteName } from "./types";

const testSuite = process.argv?.[2]?.trim() as SampleAppTestSuiteName;

if (!testSuite) {
  throw new Error("Test suite parameter is required");
}

startSampleAppContainers(testSuite);
