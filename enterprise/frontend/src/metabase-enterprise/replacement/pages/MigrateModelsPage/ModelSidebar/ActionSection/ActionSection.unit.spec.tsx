import userEvent from "@testing-library/user-event";

import { setupListSourceReplacementRunsEndpoint } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import { ActionSection } from "./ActionSection";

type SetupOpts = {
  database: Database;
};

function setup({ database }: SetupOpts) {
  setupListSourceReplacementRunsEndpoint([]);

  renderWithProviders(
    <ActionSection
      card={createMockCard({ type: "model", database_id: database.id })}
      database={database}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

function getConvertButton() {
  return screen.getByRole("button", { name: /Convert to a transform/ });
}

describe("ActionSection", () => {
  it("enables the convert button for a database that supports transforms", async () => {
    setup({ database: createMockDatabase({ features: ["transforms/table"] }) });

    await waitFor(() => expect(getConvertButton()).toBeEnabled());
  });

  it("disables the convert button and explains why for the Sample Database", async () => {
    setup({
      database: createMockDatabase({
        is_sample: true,
        features: ["transforms/table"],
      }),
    });

    await userEvent.hover(getConvertButton());

    expect(
      await screen.findByText(
        "Transforms can't be enabled on the Sample Database.",
      ),
    ).toBeInTheDocument();
    expect(getConvertButton()).toBeDisabled();
  });
});
