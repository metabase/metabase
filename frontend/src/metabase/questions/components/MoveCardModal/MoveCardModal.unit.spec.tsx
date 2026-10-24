import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { MoveModal } from "metabase/common/components/Pickers";
import type { Card, Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import { MoveCardModal } from "./MoveCardModal";

const mockSharedCollectionId = 2;
const mockPersonalSubCollectionId = 4;
const mockOtherUsersPersonalCollectionId = 5;

const CURRENT_USER = createMockUser({ id: 1, personal_collection_id: 3 });

const SHARED_COLLECTION = createMockCollection({
  id: mockSharedCollectionId,
  name: "Shared collection",
  location: "/",
  is_personal: false,
});

const PERSONAL_SUB_COLLECTION = createMockCollection({
  id: mockPersonalSubCollectionId,
  name: "My sub-collection",
  location: "/3/",
  is_personal: true,
});

const OTHER_USERS_PERSONAL_COLLECTION = createMockCollection({
  id: mockOtherUsersPersonalCollectionId,
  name: "Someone else's personal collection",
  location: "/",
  personal_owner_id: 99,
  is_personal: true,
});

const DASHBOARD = createMockDashboard({ id: 10, name: "Team dashboard" });

jest.mock("metabase/common/components/Pickers", () => ({
  MoveModal: ({ onMove }: ComponentProps<typeof MoveModal>) => (
    <div>
      <button
        onClick={() =>
          onMove({ id: mockSharedCollectionId, model: "collection" })
        }
      >
        Move to shared collection
      </button>
      <button
        onClick={() =>
          onMove({ id: mockPersonalSubCollectionId, model: "collection" })
        }
      >
        Move to my personal collection
      </button>
      <button
        onClick={() =>
          onMove({
            id: mockOtherUsersPersonalCollectionId,
            model: "collection",
          })
        }
      >
        Move to another user collection
      </button>
    </div>
  ),
}));

interface SetupOpts {
  dashboardCollection: Collection;
}

const setup = ({ dashboardCollection }: SetupOpts) => {
  const card: Card = createMockCard({
    dashboard_id: DASHBOARD.id,
    collection_id: Number(dashboardCollection.id),
    collection: dashboardCollection,
  });

  setupDashboardEndpoints(DASHBOARD);
  setupCollectionByIdEndpoint({
    collections: [
      SHARED_COLLECTION,
      PERSONAL_SUB_COLLECTION,
      OTHER_USERS_PERSONAL_COLLECTION,
    ],
  });

  renderWithProviders(<MoveCardModal card={card} onClose={() => undefined} />, {
    storeInitialState: { currentUser: CURRENT_USER },
  });
};

const NOTICE_TEXT = /You’re moving this question to a personal collection/;

describe("MoveCardModal", () => {
  it("explains the personal collection limits when moving a question from a shared dashboard to the user's personal collection", async () => {
    setup({ dashboardCollection: SHARED_COLLECTION });

    await userEvent.click(
      screen.getByRole("button", { name: "Move to my personal collection" }),
    );

    expect(await screen.findByText(NOTICE_TEXT)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("radio", { name: "No, remove it from that dashboard" }),
    );
    expect(screen.getByText(NOTICE_TEXT)).toBeInTheDocument();
  });

  it("goes back to the collection picker from the notice", async () => {
    setup({ dashboardCollection: SHARED_COLLECTION });

    await userEvent.click(
      screen.getByRole("button", { name: "Move to my personal collection" }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "move it to a shared collection",
      }),
    );

    expect(
      screen.queryByTestId("dashboard-to-collection-move-confirmation"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move to shared collection" }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      description: "to a shared collection",
      dashboardCollection: SHARED_COLLECTION,
      destinationButton: "Move to shared collection",
    },
    {
      description: "from a dashboard that's already in a personal collection",
      dashboardCollection: PERSONAL_SUB_COLLECTION,
      destinationButton: "Move to my personal collection",
    },
    {
      description: "to someone else's personal collection",
      dashboardCollection: SHARED_COLLECTION,
      destinationButton: "Move to another user collection",
    },
  ])(
    "doesn't show the notice when moving $description",
    async ({ dashboardCollection, destinationButton }) => {
      setup({ dashboardCollection });

      await userEvent.click(
        screen.getByRole("button", { name: destinationButton }),
      );

      expect(
        await screen.findByTestId("dashboard-to-collection-move-confirmation"),
      ).toBeInTheDocument();
      expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument();
    },
  );
});
