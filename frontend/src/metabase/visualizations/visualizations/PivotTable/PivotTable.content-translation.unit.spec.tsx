import { screen } from "@testing-library/react";

import { mockOffsetHeightAndWidth, renderWithProviders } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";

import { PivotTableTestWrapper } from "./pivot-table-test-mocks";

jest.mock("metabase/content-translation/hooks", () => ({
  useTranslateContent:
    () =>
    (msgid: string): string =>
      msgid === "field-123" ? "le-champ-traduit" : msgid,
}));

registerVisualizations();

describe("Visualizations > PivotTable > content translation (metabase#63296)", () => {
  beforeAll(() => {
    mockOffsetHeightAndWidth(500);
  });

  it("translates the custom column title in the pivot row header", () => {
    renderWithProviders(<PivotTableTestWrapper isDashboard={false} />);

    expect(screen.getByText("le-champ-traduit")).toBeInTheDocument();
    expect(screen.queryByText("field-123")).not.toBeInTheDocument();
  });
});
