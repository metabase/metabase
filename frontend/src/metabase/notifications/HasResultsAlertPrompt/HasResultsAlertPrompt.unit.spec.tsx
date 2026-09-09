import userEvent from "@testing-library/user-event";

import {
  setupNotificationChannelsEndpoints,
  setupUserRecipientsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { setupWebhookChannelsEndpoint } from "__support__/server-mocks/channel";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import type { Card } from "metabase-types/api";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { HasResultsAlertPrompt } from "./HasResultsAlertPrompt";

function setup(cardOpts: Partial<Card> = {}) {
  const card = createMockCard(cardOpts);
  setupNotificationChannelsEndpoints({ email: { configured: true } });
  setupWebhookChannelsEndpoint([]);
  setupUserRecipientsEndpoint({ users: [] });
  setupUsersEndpoints([]);

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const question = checkNotNull(
    getMetadata(storeInitialState).question(card.id),
  );

  renderWithProviders(<HasResultsAlertPrompt question={question} />, {
    storeInitialState,
  });
}

describe("HasResultsAlertPrompt", () => {
  it("should render the alert link for a question that supports a rows alert", () => {
    setup({ display: "table" });

    expect(screen.getByText("get an alert")).toBeInTheDocument();
  });

  it("should render nothing for a question that supports a goal alert", () => {
    setup({ display: "progress" });

    expect(screen.queryByText("get an alert")).not.toBeInTheDocument();
  });

  it("should open the alert modal when the link is clicked", async () => {
    setup({ display: "table" });

    await userEvent.click(screen.getByText("get an alert"));

    expect(await screen.findByTestId("alert-create")).toBeInTheDocument();
  });
});
