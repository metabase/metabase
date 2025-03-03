import { SAMPLE_APP_SETUP_CONFIGS } from "../constants/sample-app-setup-configs";
import type { SampleAppName, SampleAppSetupConfig } from "../types";

export function getSetupConfigsForSampleApps(sampleApps: SampleAppName[]) {
  return Object.entries(SAMPLE_APP_SETUP_CONFIGS)
    .filter(([appName]) => sampleApps.includes(appName as SampleAppName))
    .map(([appName, setupConfigs]) =>
      setupConfigs.map(
        setupConfig =>
          [appName, setupConfig] as [SampleAppName, SampleAppSetupConfig],
      ),
    )
    .flat();
}
