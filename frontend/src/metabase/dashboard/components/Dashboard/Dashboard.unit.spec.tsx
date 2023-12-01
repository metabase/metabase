import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import {
  createMockActionDashboardCard as _createMockActionDashboardCard,
  createMockActionParameter,
  createMockDashboard,
} from "metabase-types/api/mocks";
import type { Parameter } from "metabase-types/api";
import { Dashboard as DashboardComponent } from "./Dashboard";

type TestedProps = {
  dashboardId: number;
  selectedTabId: number | null; // when there's no tabs, is null
  parameters: Parameter[]; // when empty, is an empty array
  parameterValues?: Record<string, any>; // when empty, is undefined
};

type SetupReturn = {
  rerender: (props: TestedProps) => void;
  mockLoadDashboardParams: jest.Mock;
  mockFetchDashboard: jest.Mock;
  mockFetchDashboardCardData: jest.Mock;
  mockFetchDashboardCardMetadata: jest.Mock;
};

async function setup(props: TestedProps): Promise<SetupReturn> {
  const mockDashboard = createMockDashboard({ id: 10 }); // value is irrelevant
  const mockLoadDashboardParams = jest.fn();
  const mockFetchDashboard = jest.fn(() => mockDashboard);
  const mockFetchDashboardCardData = jest.fn();
  const mockFetchDashboardCardMetadata = jest.fn();

  function TestComponent(props: TestedProps) {
    return (
      <DashboardComponent
        dashboard={mockDashboard}
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
      dashboardId={props.dashboardId}
      selectedTabId={props.selectedTabId}
      parameters={props.parameters}
      parameterValues={props.parameterValues}
    />,
  );

  await waitForLoaderToBeRemoved();

  return {
    rerender: (props: TestedProps) => rerender(<TestComponent {...props} />),
    mockLoadDashboardParams,
    mockFetchDashboard,
    mockFetchDashboardCardData,
    mockFetchDashboardCardMetadata,
  };
}

describe("Dashboard data fetching", () => {
  const DEFAULT_PROPS: TestedProps = {
    dashboardId: 10,
    selectedTabId: null,
    parameters: [],
    parameterValues: undefined,
  };

  afterEach(() => jest.clearAllMocks());

  it("should fetch dashboard on first load", async () => {
    const mocks = await setup(DEFAULT_PROPS);
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("should not fetch anything on re-render", async () => {
    const mocks = await setup(DEFAULT_PROPS);
    jest.clearAllMocks();
    mocks.rerender(DEFAULT_PROPS);
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
  });

  it("should fetch dashboard on dashboard id change", async () => {
    const mocks = await setup(DEFAULT_PROPS);
    mocks.rerender({ ...DEFAULT_PROPS, dashboardId: 20 });
    expect(mocks.mockFetchDashboard).toHaveBeenCalledTimes(2);
  });

  it("should fetch card data and metadata when tab id changes", async () => {
    const mocks = await setup(DEFAULT_PROPS);
    mocks.rerender({ ...DEFAULT_PROPS, selectedTabId: 1 });
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(1);
  });

  it("should fetch card data when parameters change", async () => {
    const mocks = await setup(DEFAULT_PROPS);
    jest.clearAllMocks();
    mocks.rerender({
      ...DEFAULT_PROPS,
      parameters: [createMockActionParameter()],
    });
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
  });

  it("should fetch card data when parameter properties change", async () => {
    const mocks = await setup({
      ...DEFAULT_PROPS,
      parameters: [createMockActionParameter()],
    });
    jest.clearAllMocks();
    mocks.rerender({
      ...DEFAULT_PROPS,
      parameters: [createMockActionParameter({ id: "another" })],
    });
    expect(mocks.mockFetchDashboardCardMetadata).toHaveBeenCalledTimes(0);
    expect(mocks.mockFetchDashboardCardData).toHaveBeenCalledTimes(1);
  });
});
