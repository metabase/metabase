import { screen } from "@testing-library/react";

import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AdminEmail } from "./AdminEmail";

interface SetupOpts {
  adminEmail: string;
}

const setup = ({ adminEmail }: SetupOpts) => {
  const storeInitialState = createMockState({
    settings: mockSettings(
      createMockSettings({
        "admin-email": adminEmail,
      }),
    ),
  });

  renderWithProviders(<AdminEmail />, {
    storeInitialState,
  });
};

describe("AdminEmail", () => {
  it("should render admin's email as a link (metabase#42929)", () => {
    setup({ adminEmail: "admin@metabase.test" });

    const link = screen.getByText("admin@metabase.test");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:admin@metabase.test");
  });

  it("renders nothing when there's no admin email", () => {
    setup({ adminEmail: "" });

    expect(screen.queryByText("admin@metabase.test")).not.toBeInTheDocument();
  });
});
