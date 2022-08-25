import React from "react";
import { screen, waitFor } from "@testing-library/react";

import EntityName from "./EntityName";
import { renderWithProviders } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

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
            entities: {
              users: {
                [mockUser.id]: mockUser,
              },
            },
          },
        },
      );
      expect(await screen.findByText("Testy Tableton")).toBeInTheDocument();
    });
  });
});
