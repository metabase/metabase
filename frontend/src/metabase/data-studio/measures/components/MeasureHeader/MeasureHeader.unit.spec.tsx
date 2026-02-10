import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockMeasure } from "metabase-types/api/mocks";

import { MeasureHeader } from "./MeasureHeader";

type SetupOpts = {
  readOnly?: boolean;
};

const setup = ({ readOnly }: SetupOpts = {}) => {
  const tabUrls = {
    definition: "/measures/1/definition",
    revisions: "/measures/1/revisions",
    dependencies: "/measures/1/dependencies",
  };
  const measure = createMockMeasure({ name: "Order count" });

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <MeasureHeader
          measure={measure}
          onRemove={jest.fn()}
          readOnly={readOnly}
          tabUrls={tabUrls}
          previewUrl="/measures/1/preview"
        />
      )}
    />,
    { withRouter: true },
  );
};

describe("MeasureHeader", () => {
  it("renders an input with the measure name", () => {
    setup();
    expect(screen.getByPlaceholderText("New measure")).toBeEnabled();
    expect(screen.getByPlaceholderText("New measure")).toHaveValue(
      "Order count",
    );
  });

  it("shows preview and remove options in the actions menu", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Measure actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Preview/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Remove measure/ }),
    ).toBeInTheDocument();
  });

  describe("when read-only", () => {
    it("disables the name input", () => {
      setup({ readOnly: true });
      expect(screen.getByPlaceholderText("New measure")).toBeDisabled();
    });

    it("does not render the remove measure menu option", async () => {
      setup({ readOnly: true });
      await userEvent.click(
        screen.getByRole("button", { name: "Measure actions" }),
      );
      expect(
        screen.getByRole("menuitem", { name: /Preview/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Remove measure/ }),
      ).not.toBeInTheDocument();
    });
  });
});
