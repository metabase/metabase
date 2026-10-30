import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { ListGlossaryResponse } from "metabase/api";

import { GlossaryPage } from "./GlossaryPage";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <div data-testid="app-switcher" />,
}));

function setup({ can_write }: Pick<ListGlossaryResponse, "can_write">) {
  const response: ListGlossaryResponse = {
    data: [{ id: 1, term: "ARR", definition: "Annual recurring revenue" }],
    can_write,
  };
  fetchMock.get("path:/api/glossary", response);

  renderWithProviders(<GlossaryPage />, { withRouter: true });
}

describe("GlossaryPage", () => {
  it("hides the add and delete controls and shows entries as text when the glossary is not writable", async () => {
    setup({ can_write: false });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("textbox"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new term/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the add and delete controls and enables editing when the glossary is writable", async () => {
    setup({ can_write: true });

    expect(await screen.findByDisplayValue("ARR")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /new term/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
