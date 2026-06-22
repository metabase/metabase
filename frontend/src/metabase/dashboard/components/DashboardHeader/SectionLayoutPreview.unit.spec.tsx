import { render } from "@testing-library/react";

import { ThemeProvider } from "metabase/ui";

import { SectionLayoutPreview } from "./SectionLayoutPreview";

const createPreviewItem = ({
  col,
  row,
  size_x,
  size_y,
}: {
  col: number;
  row: number;
  size_x: number;
  size_y: number;
}) => {
  const virtualCard = {
    name: null,
    display: "heading" as const,
    visualization_settings: {},
    archived: false,
  };

  return {
    col,
    row,
    size_x,
    size_y,
    card: virtualCard,
    visualization_settings: { virtual_card: virtualCard },
  };
};

const TEST_LAYOUT: Parameters<typeof SectionLayoutPreview>[0]["layout"] = {
  id: "kpi_grid",
  label: "KPI grid",
  getLayout: () => [
    createPreviewItem({
      col: 0,
      row: 0,
      size_x: 24,
      size_y: 1,
    }),
    createPreviewItem({
      col: 0,
      row: 1,
      size_x: 12,
      size_y: 5,
    }),
  ],
};

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe("SectionLayoutPreview", () => {
  it("renders layout options without React key warnings", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderWithTheme(<SectionLayoutPreview layout={TEST_LAYOUT} />);

    const hasKeyWarning = consoleErrorSpy.mock.calls.some((call) =>
      call.some(
        (message) =>
          typeof message === "string" && message.includes('unique "key" prop'),
      ),
    );

    expect(hasKeyWarning).toBe(false);
  });
});
