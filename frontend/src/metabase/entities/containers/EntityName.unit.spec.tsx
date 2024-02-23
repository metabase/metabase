import { screen } from "@testing-library/react";

import {
  setupCardEndpoints,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";

import { EntityName } from "./EntityName";

describe("EntityName", () => {
  describe("users", () => {
    test("user with name", async () => {
      const mockUser = createMockUser({
        common_name: "Testy Tableton",
      });
      setupUserEndpoints(mockUser);

      renderWithProviders(
        <EntityName entityType="users" entityId={mockUser.id} />,
        {
          storeInitialState: {
            entities: createMockEntitiesState({
              users: [mockUser],
            }),
          },
        },
      );
      expect(await screen.findByText("Testy Tableton")).toBeInTheDocument();
    });
  });

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
