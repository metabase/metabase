import { getIcon, renderWithProviders, screen } from "__support__/ui";
import {
  createOrdersTaxField,
  createProductsCreatedAtField,
} from "metabase-types/api/mocks/presets";

import { SemanticTypeLabel } from "./SemanticTypeLabel";

function setup(semanticType: string | null | undefined) {
  return renderWithProviders(<SemanticTypeLabel semanticType={semanticType} />);
}

describe("SemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    const field = createProductsCreatedAtField();

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
    const field = createOrdersTaxField();

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
