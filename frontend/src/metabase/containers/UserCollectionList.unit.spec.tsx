import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
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
  fetchMock.get("path:/api/user", (_: any, __: any, request: Request) => {
    const params = new URL(request.url).searchParams;
    const limit = parseInt(params.get("limit") ?? "0");
    const offset = parseInt(params.get("offset") ?? "0");
    return MockUsers.slice(offset, offset + limit);
  });
  renderWithProviders(<UserCollectionList />);
};

describe("UserCollectionList", () => {
  it("should show pages of users", async () => {
    setup();

    expect(await screen.findByText("big boi 0")).toBeInTheDocument();
    expect(await screen.findAllByRole("list-item")).toHaveLength(27);

    expect(await screen.findByText("1 - 27")).toBeInTheDocument();

    expect(await screen.findByTestId("previous-page-btn")).toBeDisabled();
    userEvent.click(await screen.findByTestId("next-page-btn"));

    expect(await screen.findByText("28 - 54")).toBeInTheDocument();

    expect(await screen.findByText("big boi 29")).toBeInTheDocument();
    expect(await screen.findByTestId("previous-page-btn")).toBeEnabled();
  });
});
