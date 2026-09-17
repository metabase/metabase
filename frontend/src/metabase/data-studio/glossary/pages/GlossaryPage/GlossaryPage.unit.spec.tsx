import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
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
  it("hides the add button and row edit controls when the glossary is not writable", async () => {
    setup({ can_write: false });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new term/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("ARR"));
    expect(screen.queryByPlaceholderText("Boat")).not.toBeInTheDocument();
  });

  it("shows the add button and row edit controls when the glossary is writable", async () => {
    setup({ can_write: true });

    expect(await screen.findByText("ARR")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new term/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();

    await userEvent.click(screen.getByText("ARR"));
    expect(screen.getByPlaceholderText("Boat")).toBeInTheDocument();
  });
});
