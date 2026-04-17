import type { ReactNode } from "react";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockVersion } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { MarkdownLink } from "./MarkdownLink";

interface SetupProps {
  href: string;
  children: ReactNode;
}

const setup = ({ href, children }: SetupProps) => {
  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "show-metabase-links": true,
      version: createMockVersion({ tag: "v0.1" }),
    }),
  });
  return renderWithProviders(
    <Route
      component={() => <MarkdownLink href={href}>{children}</MarkdownLink>}
      path="/"
    />,
    {
      initialRoute: "/",
      withRouter: true,
      storeInitialState,
    },
  );
};

describe("MarkdownLink", () => {
  it("should render a link", () => {
    setup({ href: "https://metabase.com", children: "Metabase Link" });
    expect(
      screen.getByRole("link", { name: "Metabase Link" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Metabase Link" })).toHaveAttribute(
      "href",
      "https://metabase.com",
    );
  });

  it("should transform relative .md file links into external doc links", () => {
    setup({ href: "../../another-file.md", children: "Metabase Link" });
    expect(screen.getByRole("link", { name: "Metabase Link" })).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/v0.1/databases/connections/../../another-file.html",
    );
  });
});
