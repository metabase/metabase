import { createScenario } from "__support__/scenarios";
import { screen } from "__support__/ui";

import { AdminEmail } from "./AdminEmail";

interface SetupOpts {
  adminEmail: string | null;
}

const setup = ({ adminEmail }: SetupOpts) => {
  const { render } = createScenario()
    .withSettings({ "admin-email": adminEmail })
    .build();

  render(<AdminEmail />);
};

describe("AdminEmail", () => {
  it("should render admin's email as a link (metabase#42929)", () => {
    setup({ adminEmail: "admin@metabase.test" });

    const link = screen.getByText("admin@metabase.test");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:admin@metabase.test");
  });

  it("renders nothing when email is an empty string (unlikely to ever happen)", () => {
    setup({ adminEmail: "" });

    expect(screen.queryByText("admin@metabase.test")).not.toBeInTheDocument();
  });

  it("renders nothing when there's no admin email", () => {
    setup({ adminEmail: null });

    expect(screen.queryByText("admin@metabase.test")).not.toBeInTheDocument();
  });
});
