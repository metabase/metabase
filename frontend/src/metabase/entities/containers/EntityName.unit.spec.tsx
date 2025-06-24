import {
  setupCardEndpoints,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockCard, createMockDashboard } from "metabase-types/api/mocks";

import { EntityName } from "./EntityName";

describe("EntityName", () => {
  describe("dashboards", () => {
    test("dashboard with name", async () => {
      const mockDash = createMockDashboard({
        name: "Testy dash dash",
      });
      setupDashboardEndpoints(mockDash);

      renderWithProviders(
        <EntityName entityType="dashboards" entityId={mockDash.id} />,
        {
          storeInitialState: {
            entities: createMockEntitiesState({
              dashboards: [mockDash],
            }),
          },
        },
      );
      expect(await screen.findByText("Testy dash dash")).toBeInTheDocument();
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
