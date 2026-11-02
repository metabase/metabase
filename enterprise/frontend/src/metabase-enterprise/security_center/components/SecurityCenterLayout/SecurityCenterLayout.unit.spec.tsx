import { renderWithProviders, screen } from "__support__/ui";
import { Route, redirect } from "metabase/router";

import { SecurityCenterLayout } from "./SecurityCenterLayout";

interface SetupOpts {
  initialRoute: string;
}

const setup = ({ initialRoute }: SetupOpts) =>
  renderWithProviders(
    <Route path="/admin/security-center" element={<SecurityCenterLayout />}>
      <Route index element={redirect("advisories")} />
      <Route path="advisories" element={<div>Advisories page</div>} />
      <Route path="health-checks" element={<div>Health checks page</div>} />
    </Route>,
    { withRouter: true, initialRoute },
  );

describe("SecurityCenterLayout", () => {
  it("shows the sections in the sidebar", () => {
    setup({ initialRoute: "/admin/security-center/health-checks" });

    expect(screen.getByRole("link", { name: /Advisories/ })).toHaveAttribute(
      "href",
      "/admin/security-center/advisories",
    );
    expect(screen.getByRole("link", { name: /Health checks/ })).toHaveAttribute(
      "href",
      "/admin/security-center/health-checks",
    );
    expect(screen.getByText("Health checks page")).toBeInTheDocument();
  });

  it("opens advisories by default and keeps the query string", () => {
    const { router } = setup({
      initialRoute: "/admin/security-center?open=notifications",
    });

    expect(screen.getByText("Advisories page")).toBeInTheDocument();
    expect(router?.location.search).toBe("?open=notifications");
  });
});
