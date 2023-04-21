import React from "react";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockEntitiesState } from "metabase-types/store/mocks";
import EntityName from "./EntityName";

describe("EntityName", () => {
  describe("users", () => {
    test("user with name", async () => {
      const mockUser = createMockUser({
        common_name: "Testy Tableton",
      });
      renderWithProviders(
        <EntityName entityType="users" entityId={mockUser.id} />,
        {
          storeInitialState: {
            entities: createMockEntitiesState({
              users: {
                [mockUser.id]: mockUser,
              },
            }),
          },
        },
      );
      expect(await screen.findByText("Testy Tableton")).toBeInTheDocument();
    });
  });
});
