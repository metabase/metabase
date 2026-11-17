import { setupUsersEndpoints } from "__support__/server-mocks";
import {
  createMockMediaQueryList,
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
  setupUsersEndpoints(MockUsers);

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

  it("should show users in column order while keeping each personal collection link (#83318)", async () => {
    jest
      .spyOn(window, "matchMedia")
      .mockReturnValue(createMockMediaQueryList({ matches: true }));

    setup();

    const links = await screen.findAllByRole("link", { name: /big boi \d+$/ });

    expect(links.slice(0, 8).map((link) => link.textContent)).toEqual([
      "big boi 0",
      "big boi 25",
      "big boi 50",
      "big boi 75",
      "big boi 1",
      "big boi 26",
      "big boi 51",
      "big boi 76",
    ]);
    expect(screen.getByRole("link", { name: /big boi 25$/ })).toHaveAttribute(
      "href",
      "/collection/27",
    );
    expect(screen.queryByText("big boi 24")).not.toBeInTheDocument();
    expect(screen.queryByText("big boi 99")).not.toBeInTheDocument();
  });
});
