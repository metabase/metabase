import { renderWithProviders, screen } from "__support__/ui";
import { createMockCustomVizPlugin } from "metabase-types/api/mocks";

import { CustomVizPluginSummary } from "./CustomVizPluginSummary";

describe("CustomVizPluginSummary", () => {
  it("renders no warnings for a plugin without them", () => {
    renderWithProviders(
      <CustomVizPluginSummary plugin={createMockCustomVizPlugin()} />,
    );

    expect(screen.getByText("My Viz")).toBeInTheDocument();
    expect(
      screen.queryByText(/Built with SDK version/),
    ).not.toBeInTheDocument();
  });

  it("renders an SDK version warning with a changelog link", () => {
    renderWithProviders(
      <CustomVizPluginSummary
        plugin={createMockCustomVizPlugin({
          warnings: [
            {
              type: "sdk-version-mismatch",
              sdk_version: null,
              tested_sdk_range: "2.0",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/Built with SDK version 1\.x/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See the SDK changelog" }),
    ).toHaveAttribute("href", expect.stringContaining("CHANGELOG.md"));
  });

  it("renders multiple warnings of different types", () => {
    renderWithProviders(
      <CustomVizPluginSummary
        plugin={createMockCustomVizPlugin({
          warnings: [
            {
              type: "sdk-version-mismatch",
              sdk_version: "3.1.0",
              tested_sdk_range: "2.0",
            },
            {
              type: "metabase-version-mismatch",
              metabase_version: ">=1.99",
              current_version: "v1.64.0",
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/Built with SDK version 3\.1\.0/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Requires Metabase >=1\.99, but this instance is on/),
    ).toBeInTheDocument();
  });

  it("renders a metabase.version warning without a changelog link", () => {
    renderWithProviders(
      <CustomVizPluginSummary
        plugin={createMockCustomVizPlugin({
          warnings: [
            {
              type: "metabase-version-mismatch",
              metabase_version: ">=1.99",
              current_version: "v1.64.0",
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(/Requires Metabase >=1\.99, but this instance is on/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "See the SDK changelog" }),
    ).not.toBeInTheDocument();
  });
});
