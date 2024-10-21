import {
  type RenderWithProvidersOptions,
  renderWithProviders,
} from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import { DashboardEntityIdCard } from "../DashboardEntityIdCard";

export const setup = ({
  dashboard = createMockDashboard(),
  ...renderOptions
}: {
  dashboard?: Dashboard;
} & RenderWithProvidersOptions = {}) => {
  return renderWithProviders(
    <DashboardEntityIdCard dashboard={dashboard} />,
    renderOptions,
  );
};
