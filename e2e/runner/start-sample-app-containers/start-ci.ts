import type { SampleAppTestSuiteName } from "../sample-apps-shared/types";

import { startSampleAppContainers } from "./startSampleAppContainers";

startSampleAppContainers(process.env.TEST_SUITE as SampleAppTestSuiteName);
