import { screen, waitFor, cleanup } from "@testing-library/react";

import { setup } from "./setup";

describe("LegendCaption (OSS)", () => {
  it("should display the original title when enterprise plugins are not available", async () => {
    setup({
      title: "Hello World",
      locale: "es",
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Hello World",
      );
    });
  });

  it("should display title and description correctly", async () => {
    setup({
      title: "Chart Title",
      description: "Chart Description",
    });

    await waitFor(() => {
      expect(screen.getByTestId("legend-caption-title")).toHaveTextContent(
        "Chart Title",
      );
      expect(screen.getByText("info")).toBeInTheDocument(); // Description icon
    });
  });
});
