import { startHostAppContainers } from "./start-host-app-containers";
import type { HostAppTestSuiteName } from "./types";

const testSuite = process.argv?.[2]?.trim() as HostAppTestSuiteName;

if (!testSuite) {
  throw new Error("Test suite parameter is required");
}

startHostAppContainers(testSuite);
