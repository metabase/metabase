import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { SummarySidebar } from "./SummarySidebar";

function setup() {
  renderWithProviders(
    <SummarySidebar
      query={Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY)}
      stageIndex={-1}
    />,
  );
}

describe("SummarySidebar", () => {
  it("opens with the field list beside the space for the wells", () => {
    setup();

    expect(screen.getByTestId("summary-wells")).toBeInTheDocument();
    expect(screen.getByTestId("summary-field-list-drawer")).toHaveAttribute(
      "data-open",
    );
    expect(screen.getByLabelText("Hide fields")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Search fields")).toBeInTheDocument();
  });

  it("hides and shows the field list from the footer button", async () => {
    setup();
    const drawer = screen.getByTestId("summary-field-list-drawer");

    await userEvent.click(screen.getByLabelText("Hide fields"));
    expect(drawer).not.toHaveAttribute("data-open");
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Show fields")).toHaveAttribute(
      "aria-controls",
      drawer.id,
    );

    await userEvent.click(screen.getByLabelText("Show fields"));
    expect(drawer).toHaveAttribute("data-open");
    expect(screen.getByLabelText("Hide fields")).toBeInTheDocument();
  });
});
