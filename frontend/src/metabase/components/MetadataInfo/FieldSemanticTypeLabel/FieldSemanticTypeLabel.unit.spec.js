import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  ORDERS,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import FieldSemanticTypeLabel from "./FieldSemanticTypeLabel";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

function setup(field) {
  return renderWithProviders(<FieldSemanticTypeLabel field={field} />);
}

describe("FieldSemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    const field = metadata.field(PRODUCTS.CREATED_AT);

    it("should show an icon corresponding to the given semantic type", () => {
      setup(field);
      expect(getIcon("calendar")).toBeInTheDocument();
    });

    it("should display the name of the semantic type", () => {
      setup(field);
      expect(screen.getByText("Creation timestamp")).toBeInTheDocument();
    });
  });

  describe("given a dimension without a semantic type", () => {
    const field = metadata.field(ORDERS.TAX);

    it("should show an ellipsis icon representing the lack of semantic type", () => {
      setup(field);
      expect(getIcon("ellipsis")).toBeInTheDocument();
    });

    it("should display the given dimension's display name", () => {
      setup(field);
      expect(screen.getByText("No special type")).toBeInTheDocument();
    });
  });
});
