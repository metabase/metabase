import { screen } from "__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";

import { setupSdkDashboard } from "../tests/setup";

import { StaticDashboard, type StaticDashboardProps } from "./StaticDashboard";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const setup = async (
  options: {
    props?: Partial<StaticDashboardProps>;
    providerProps?: Partial<MetabaseProviderProps>;
    isLocaleLoading?: boolean;
  } = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: StaticDashboard,
  });
};

describe("StaticDashboard", () => {
  it("hides the dashboard card question title when withCardTitle is false", async () => {
    await setup({ props: { withCardTitle: false } });

    expect(screen.queryByText("Here is a card title")).not.toBeInTheDocument();
  });
});
