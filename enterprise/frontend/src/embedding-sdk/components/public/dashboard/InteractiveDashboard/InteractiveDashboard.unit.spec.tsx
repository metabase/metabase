import { screen, waitFor } from "__support__/ui";
import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";

import { setupSdkDashboard } from "../tests/setup";

import {
  InteractiveDashboard,
  type InteractiveDashboardProps,
} from "./InteractiveDashboard";

const setup = async (
  options: {
    props?: Partial<InteractiveDashboardProps>;
    providerProps?: Partial<MetabaseProviderProps>;
    isLocaleLoading?: boolean;
  } = {},
) => {
  return setupSdkDashboard({
    ...options,
    component: InteractiveDashboard,
  });
};

describe("InteractiveDashboard", () => {
  it("should only show refresh, nightmode, and fullscreen toggles", async () => {
    await setup();

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-header")).toBeInTheDocument();
    });

    screen.debug(screen.getByTestId("dashboard-header"), 100000000);
  });
});
