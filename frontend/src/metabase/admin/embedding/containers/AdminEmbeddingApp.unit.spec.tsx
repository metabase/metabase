import type { ComponentProps } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Route, withRouteProps } from "metabase/router";

import { AdminEmbeddingApp } from "./AdminEmbeddingApp";

const TestAdminEmbeddingApp = (
  props: ComponentProps<typeof AdminEmbeddingApp>,
) => (
  <AdminEmbeddingApp {...props}>
    <div>content</div>
  </AdminEmbeddingApp>
);

const RoutedTestAdminEmbeddingApp = withRouteProps(TestAdminEmbeddingApp);

describe("AdminEmbeddingApp", () => {
  it("shows the sidebar on the setup guide root", () => {
    renderWithProviders(
      <Route path="*" element={<RoutedTestAdminEmbeddingApp />} />,
      {
        initialRoute: "/admin/embedding/setup-guide",
        withRouter: true,
      },
    );

    expect(screen.getByTestId("admin-layout-sidebar")).toBeInTheDocument();
  });

  it.each([
    "/admin/embedding/setup-guide/permissions",
    "/admin/embedding/setup-guide/sso",
  ])("hides the sidebar for %s", (pathname) => {
    renderWithProviders(
      <Route path="*" element={<RoutedTestAdminEmbeddingApp />} />,
      {
        initialRoute: pathname,
        withRouter: true,
      },
    );

    expect(
      screen.queryByTestId("admin-layout-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-layout-content")).toBeInTheDocument();
  });

  it("hides the sidebar for theme editor paths", () => {
    renderWithProviders(
      <Route path="*" element={<RoutedTestAdminEmbeddingApp />} />,
      {
        initialRoute: "/admin/embedding/themes/42",
        withRouter: true,
      },
    );

    expect(
      screen.queryByTestId("admin-layout-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-layout-content")).toBeInTheDocument();
  });

  it("shows the sidebar on the themes listing page", () => {
    renderWithProviders(
      <Route path="*" element={<RoutedTestAdminEmbeddingApp />} />,
      {
        initialRoute: "/admin/embedding/themes",
        withRouter: true,
      },
    );

    expect(screen.getByTestId("admin-layout-sidebar")).toBeInTheDocument();
  });
});
