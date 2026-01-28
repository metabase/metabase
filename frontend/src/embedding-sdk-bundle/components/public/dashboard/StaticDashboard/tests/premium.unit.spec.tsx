import type { ComponentType } from "react";

import type { SdkDashboardProps } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboard";

import { addPremiumSubscriptionsTests } from "../../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../../tests/setup";
import { StaticDashboard } from "../StaticDashboard";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const setupPremium = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    tokenFeatures: {
      embedding_sdk: true,
    },
    enterprisePlugins: ["sdk_notifications"],
    component: StaticDashboard as ComponentType<SdkDashboardProps>,
  });
};
console.warn = () => {};

describe("StaticDashboard", () => {
  addPremiumSubscriptionsTests(setupPremium);
});
