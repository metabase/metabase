import { render, screen } from "__support__/ui";
import type { TypeFilterProps } from "metabase/search/types";
import type { EnabledSearchModelType } from "metabase-types/api";
import { TypeFilterDisplay } from "./TypeFilterDisplay";

const MODEL_TYPE_DISPLAY_NAMES: Record<EnabledSearchModelType, string> = {
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
  it("should display title when no type is selected", () => {
    setup([]);
    const expectedText = "Content type";
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it.each(Object.keys(MODEL_TYPE_DISPLAY_NAMES))(
    "should display correct text for %s type selected",
    type => {
      const searchModelType = type as EnabledSearchModelType;
      setup([searchModelType]);
      const expectedText: string = MODEL_TYPE_DISPLAY_NAMES[searchModelType];
      expect(screen.getByText(expectedText)).toBeInTheDocument();
    },
  );

  it("should display correct text for multiple types selected", () => {
    setup(["dashboard", "database"]);
    const expectedText = "2 types selected";
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });
});
