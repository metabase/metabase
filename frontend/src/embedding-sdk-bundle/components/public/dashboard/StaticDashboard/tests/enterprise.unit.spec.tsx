import { addEnterpriseSubscriptionsTests } from "../../shared-tests/subscriptions.spec";
import {
  type SetupSdkDashboardOptions,
  setupSdkDashboard,
} from "../../tests/setup";
import { StaticDashboard } from "../StaticDashboard";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const setupEnterprise = async (
  options: Omit<SetupSdkDashboardOptions, "component"> = {},
) => {
  return setupSdkDashboard({
    ...options,
    enterprisePlugins: ["sdk_subscriptions"],
    component: StaticDashboard,
  });
};
console.warn = () => {};

describe("StaticDashboard", () => {
  addEnterpriseSubscriptionsTests(setupEnterprise);
});
