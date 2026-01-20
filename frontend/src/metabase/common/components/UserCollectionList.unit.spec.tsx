import fetchMock from "fetch-mock";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UserCollectionList } from "./UserCollectionList";

const MockUsers = new Array(100).fill(0).map((_, index) =>
  createMockUser({
    id: index,
    common_name: `big boi ${index}`,
    personal_collection_id: index + 2,
  }),
);

const setup = () => {
  fetchMock.get("path:/api/user", { data: MockUsers });

  renderWithProviders(<UserCollectionList />);
};

describe("UserCollectionList", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show virtualized list of users", async () => {
    setup();

    // First items should be visible
    expect(await screen.findByText("big boi 0")).toBeInTheDocument();
    expect(await screen.findByText("big boi 1")).toBeInTheDocument();

    // Items far down should not be rendered due to virtualization
    expect(screen.queryByText("big boi 98")).not.toBeInTheDocument();
    expect(screen.queryByText("big boi 99")).not.toBeInTheDocument();
  });
});
