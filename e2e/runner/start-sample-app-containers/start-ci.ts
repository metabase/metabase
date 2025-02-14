import type { SampleAppTestSuiteName } from "../sample-apps-shared/types";

import { start as startSampleAppContainers } from "./start";

startSampleAppContainers(process.env.TEST_SUITE as SampleAppTestSuiteName);
