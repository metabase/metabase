import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import {
  createMockActionDashboardCard as _createMockActionDashboardCard,
  createMockActionParameter,
  createMockDashboard,
} from "metabase-types/api/mocks";
import type { Dashboard, Parameter } from "metabase-types/api";
import { Dashboard as DashboardComponent } from "./Dashboard";

type SetupOpts = {
  dashboardId: number | null;
  dashboard: Dashboard | null;
  selectedTabId: number | null; // when there's no tabs, is null
  parameters: Parameter[]; // when empty, is an empty array
  parameterValues?: Record<string, any>; // when empty, is undefined
  skipLoader?: boolean;
};

async function setup(overrides: Partial<SetupOpts> = {}) {
  const mockDashboard = createMockDashboard({ id: 10 }); // value is irrelevant

  const opts: SetupOpts = {
    dashboardId: 10,
    dashboard: mockDashboard,
    selectedTabId: null,
    parameters: [],
    parameterValues: undefined,
    ...overrides,
  };
  const mockLoadDashboardParams = jest.fn();
  const mockFetchDashboard = jest.fn(() => mockDashboard);
  const mockFetchDashboardCardData = jest.fn();
  const mockFetchDashboardCardMetadata = jest.fn();

  function TestComponent(props: SetupOpts) {
    return (
      <DashboardComponent
        dashboard={props.dashboard}
        dashboardId={props.dashboardId}
        parameters={props.parameters}
        parameterValues={props.parameterValues}
        loadDashboardParams={mockLoadDashboardParams}
        fetchDashboard={mockFetchDashboard}
        fetchDashboardCardData={mockFetchDashboardCardData}
        fetchDashboardCardMetadata={mockFetchDashboardCardMetadata}
        // stuff below doesn't change
        location={global.location}
        isAdmin={false}
        isFullscreen={false}
        isNightMode={false}
        isSharing={false}
        isEditing={false}
        isEditingParameter={false}
        isNavbarOpen={false}
        isHeaderVisible={false}
        isAdditionalInfoVisible={false}
        isNavigatingBackToDashboard={false}
        editingOnLoad={false}
        addCardOnLoad={null}
        isAutoApplyFilters={false} // TODO true or false?
        dashcardData={{}}
        selectedTabId={props.selectedTabId}
        draftParameterValues={{}}
        editingParameter={{}}
        sidebar={{ name: "any", props: {} }}
        addCardToDashboard={jest.fn()}
        addParameter={jest.fn()}
        archiveDashboard={jest.fn()}
        cancelFetchDashboardCardData={jest.fn()}
        initialize={jest.fn()}
        onRefreshPeriodChange={jest.fn()}
        updateDashboardAndCards={jest.fn()}
        setDashboardAttributes={jest.fn()}
        setEditingDashboard={jest.fn()}
        setErrorPage={jest.fn()}
        setSharing={jest.fn()}
        setParameterValue={jest.fn()}
        setEditingParameter={jest.fn()}
        setParameterIndex={jest.fn()}
        onUpdateDashCardVisualizationSettings={jest.fn()}
        onUpdateDashCardColumnSettings={jest.fn()}
        onReplaceAllDashCardVisualizationSettings={jest.fn()}
        onChangeLocation={jest.fn()}
        onSharingClick={jest.fn()}
        onEmbeddingClick={jest.fn()}
        toggleSidebar={jest.fn()}
        closeSidebar={jest.fn()}
        closeNavbar={jest.fn()}
      />
    );
  }

  const { rerender } = renderWithProviders(
    <TestComponent
      dashboard={opts.dashboard}
      dashboardId={opts.dashboardId}
      selectedTabId={opts.selectedTabId}
      parameters={opts.parameters}
      parameterValues={opts.parameterValues}
    />,
  );

  if (!opts.skipLoader) {
    await waitForLoaderToBeRemoved();
  }

  return {
    rerender: (overrides: Partial<SetupOpts> = {}) =>
      rerender(<TestComponent {...{ ...opts, ...overrides }} />),
    mockLoadDashboardParams,
    mockFetchDashboard,
    mockFetchDashboardCardData,
    mockFetchDashboardCardMetadata,
  };
}

describe("Dashboard data fetching", () => {
  afterEach(() => jest.clearAllMocks());

  it("should fetch dashboard on first load", async () => {
    const mocks = await setup();
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("should not fetch anything on re-render", async () => {
    const mocks = await setup();
    jest.clearAllMocks();
    mocks.rerender();
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
  });

  it("should fetch dashboard on dashboard id change", async () => {
    const mocks = await setup();
    mocks.rerender({ dashboardId: 20 });
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(2);
  });

  it("should fetch card data and metadata when tab id changes", async () => {
    const mocks = await setup();
    mocks.rerender({ selectedTabId: 1 });
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(1);
  });

  it("should fetch card data when parameters change", async () => {
    const mocks = await setup();
    jest.clearAllMocks();
    mocks.rerender({
      parameters: [createMockActionParameter()],
    });
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
  });

  it("should fetch card data when parameter properties change", async () => {
    const mocks = await setup({
      parameters: [createMockActionParameter()],
    });
    jest.clearAllMocks();
    mocks.rerender({
      parameters: [createMockActionParameter({ id: "another" })],
    });
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
  });

  it("should fetch card data when dashboard changes to non-empty", async () => {
    const mocks = await setup({
      dashboardId: null,
      dashboard: null,
      skipLoader: true,
    });
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(0);

    mocks.rerender({
      dashboardId: null,
      dashboard: createMockDashboard({ id: 20 }),
    });
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
  });
});
