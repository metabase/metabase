import { setupCardEndpoints } from "__support__/server-mocks/card";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui-with-store";
import { createMockCard, } from "metabase-types/api/mocks";

import { EntityName } from "./EntityName";

describe("EntityName", () => {
  describe("questions", () => {
    test("question with name (metabase#33192)", async () => {
      const expectedQuestionName = "Mock Products question";
      const mockCard = createMockCard({ name: expectedQuestionName });
      setupCardEndpoints(mockCard);

      renderWithProviders(
        <EntityName entityType="questions" entityId={mockCard.id} />,
        {
          storeInitialState: {
            entities: createMockEntitiesState({
              questions: [mockCard],
            }),
          },
        },
      );
      expect(await screen.findByText(expectedQuestionName)).toBeInTheDocument();
    });
  });
});
