import { renderWithProviders, screen, getIcon } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCTS,
  ORDERS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import Dimension from "metabase-lib/Dimension";
import DimensionSemanticTypeLabel from "./DimensionSemanticTypeLabel";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

function setup(dimension) {
  return renderWithProviders(
    <DimensionSemanticTypeLabel dimension={dimension} />,
  );
}

describe("DimensionSemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    const fieldDimension = Dimension.parseMBQL(
      ["field", PRODUCTS.CREATED_AT, null],
      metadata,
    );
    fieldDimension.field().semantic_type = "type/CreationDate";

    it("should show an icon corresponding to the given semantic type", () => {
      setup(fieldDimension);
      expect(getIcon("calendar")).toBeInTheDocument();
    });

    it("should display the name of the semantic type", () => {
      setup(fieldDimension);
      expect(screen.getByText("Creation date")).toBeInTheDocument();
    });
  });

  describe("given a dimension without a semantic type", () => {
    const fieldDimension = Dimension.parseMBQL(
      ["field", ORDERS.TAX, null],
      metadata,
    );

    it("should show an ellipsis icon representing the lack of semantic type", () => {
      setup(fieldDimension);
      expect(getIcon("ellipsis")).toBeInTheDocument();
    });

    it("should display the given dimension's display name", () => {
      setup(fieldDimension);
      expect(screen.getByText("No special type")).toBeInTheDocument();
    });
  });
});
