import {
  findRequests,
  setupCollectionByIdEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { CollectionId } from "metabase-types/api";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useGetPersonalCollection } from "./use-get-personal-collection";

const PERSONAL_COLLECTION_ID = 123;

const PERSONAL_COLLECTION = createMockCollection({
  id: PERSONAL_COLLECTION_ID,
  name: "Jack's Personal Collection",
  is_personal: true,
  personal_owner_id: 1,
});

const TestComponent = () => {
  const { data, isLoading, error } = useGetPersonalCollection();
  if (isLoading) {
    return <div>Loading</div>;
  }

  if (error) {
    return <div>{JSON.stringify(error)}</div>;
  }

  if (!data) {
    return <div>No Personal Collection</div>;
  }

  return <div>{JSON.stringify(data)}</div>;
};

interface SetupOpts {
  personalCollectionId?: CollectionId;
  error?: string;
}

const setup = ({ personalCollectionId, error }: SetupOpts = {}) => {
  const user = createMockUser({
    id: 1,
    first_name: "John",
    personal_collection_id: personalCollectionId,
  });

  if (personalCollectionId && !error) {
    setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  } else if (error) {
    setupCollectionByIdEndpoint({ collections: [], error });
  }

  const state = createMockState({
    currentUser: user,
  });

  renderWithProviders(<TestComponent />, {
    storeInitialState: state,
  });
};

describe("useGetPersonalCollection", () => {
  it("should be initially loading when user has a personal collection ID", () => {
    setup({ personalCollectionId: PERSONAL_COLLECTION_ID });
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("should fetch and display the personal collection", async () => {
    setup({ personalCollectionId: PERSONAL_COLLECTION_ID });

    expect(
      await screen.findByText(JSON.stringify(PERSONAL_COLLECTION)),
    ).toBeInTheDocument();

    const requests = await findRequests("GET");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(
      `/api/collection/${PERSONAL_COLLECTION_ID}`,
    );
  });

  it("should handle errors when fetching the collection", async () => {
    const ERROR = "Failed to load collection";
    setup({ personalCollectionId: PERSONAL_COLLECTION_ID, error: ERROR });

    expect(await screen.findByText(new RegExp(ERROR))).toBeInTheDocument();
    const requests = await findRequests("GET");
    expect(requests).toHaveLength(1);
  });

  it("should not fetch when user has no personal collection ID", async () => {
    setup({ personalCollectionId: undefined });

    expect(
      await screen.findByText("No Personal Collection"),
    ).toBeInTheDocument();

    const requests = await findRequests("GET");
    expect(requests).toHaveLength(0);
  });
});
