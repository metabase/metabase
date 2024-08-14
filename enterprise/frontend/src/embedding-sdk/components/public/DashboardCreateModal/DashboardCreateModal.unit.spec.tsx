import { screen, renderWithProviders } from "__support__/ui";
import { createMockJwtConfig } from "embedding-sdk/test/mocks/config";

import {
  DashboardCreateModal,
  type DashboardCreateModalProps,
} from "./DashboardCreateModal";

describe("DashboardCreateModal", () => {
  it("should render", () => {
    setup();

    expect(screen.getByText("New dashboard")).toBeInTheDocument();

    expect(screen.getByText("Description")).toBeInTheDocument();

    expect(
      screen.getByText("Which collection should this go in?"),
    ).toBeInTheDocument();
  });
});

function setup({ props }: { props?: Partial<DashboardCreateModalProps> } = {}) {
  renderWithProviders(<DashboardCreateModal {...props} />, {
    mode: "sdk",
    sdkProviderProps: {
      config: createMockJwtConfig(),
    },
  });
}
