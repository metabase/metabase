import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  ORDERS,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { SemanticTypeLabel } from "./SemanticTypeLabel";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

function setup(semanticType) {
  return renderWithProviders(<SemanticTypeLabel semanticType={semanticType} />);
}

describe("SemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    const field = metadata.field(PRODUCTS.CREATED_AT);

    it("should show an icon corresponding to the given semantic type", () => {
      setup(field.semantic_type);
      expect(getIcon("calendar")).toBeInTheDocument();
    });

    it("should display the name of the semantic type", () => {
      setup(field.semantic_type);
      expect(screen.getByText("Creation timestamp")).toBeInTheDocument();
    });
  });

  describe("given a dimension without a semantic type", () => {
    const field = metadata.field(ORDERS.TAX);

    it("should show an ellipsis icon representing the lack of semantic type", () => {
      setup(field.semantic_type);
      expect(getIcon("ellipsis")).toBeInTheDocument();
    });

    it("should display the given dimension's display name", () => {
      setup(field.semantic_type);
      expect(screen.getByText("No special type")).toBeInTheDocument();
    });
  });
});
