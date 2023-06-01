import fetchMock from "fetch-mock";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";
import DashboardHeader from "./DashboardHeader";

const setup = () => {
  fetchMock.get(
    "path:/api/collection/10",
    createMockCollection({
      name: "Performance",
      id: 10,
    }),
  );

  fetchMock.get("path:/api/bookmark", []);

  const dashboard = createMockDashboard({
    collection_id: 10,
  });

  renderWithProviders(
    <DashboardHeader
      dashboard={dashboard}
      saveDashboardAndCards={jest.fn()}
      setDashboardAttribute={jest.fn()}
      onEditingChange={jest.fn()}
      onRefreshPeriodChange={jest.fn()}
      onNightModeChange={jest.fn()}
      onFullscreenChange={jest.fn()}
      onSharingClick={jest.fn()}
      isFullscreen={false}
      isNightMode={false}
      setRefreshElapsedHook={jest.fn()}
      addCardToDashboard={jest.fn()}
      addTextDashCardToDashboard={jest.fn()}
      addLinkDashCardToDashboard={jest.fn()}
      isEditable={false}
      isEditing={false}
      databases={[]}
      location={{ pathname: "/dashboard/2" }}
    />,
  );
};

describe("dashboard header", () => {
  it("should render the correct buttons", async () => {
    setup();
    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
    expect(screen.getByText("Make a copy")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /beaker/i })).toBeInTheDocument();

    //Other buttons
    expect(
      screen.getByRole("button", { name: /bookmark/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fullscreen/i }),
    ).toBeInTheDocument();
  });
});
