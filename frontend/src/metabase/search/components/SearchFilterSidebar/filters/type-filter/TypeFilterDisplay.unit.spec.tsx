import { render, screen } from "__support__/ui";
import type { TypeFilterProps } from "metabase/search/types";
import type { SearchModelType } from "metabase-types/api";
import { TypeFilterDisplay } from "./TypeFilterDisplay";

const MODEL_TYPE_DISPLAY_NAMES: Record<SearchModelType, string> = {
  action: "Action",
  card: "Question",
  collection: "Collection",
  dashboard: "Dashboard",
  database: "Database",
  dataset: "Model",
  table: "Table",
};

const setup = (value: TypeFilterProps) => {
  const props = {
    value,
  };

  render(<TypeFilterDisplay {...props} />);
};
describe("TypeFilterDisplay", () => {
  it.each(Object.keys(MODEL_TYPE_DISPLAY_NAMES))(
    "should display correct text for %s type selected",
    type => {
      const searchModelType = type as SearchModelType;
      setup([searchModelType]);
      const expectedText = MODEL_TYPE_DISPLAY_NAMES[searchModelType];
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    },
  );

  it("should display correct text for multiple types selected", () => {
    setup(["dashboard", "database"]);
    const expectedText = "2 types";
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
