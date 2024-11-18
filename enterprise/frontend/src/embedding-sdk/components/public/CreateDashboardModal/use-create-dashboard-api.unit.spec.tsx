import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDashboardCreateEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import type { Dashboard } from "metabase-types/api";

import type { CreateDashboardValues } from "./use-create-dashboard-api";
import { useCreateDashboardApi } from "./use-create-dashboard-api";

const TEST_COLLECTION_ID = 11;
const TEST_DASHBOARD_ID = 123;
const TEST_DASHBOARD_NAME = "TestDashboard";

describe("useCreateDashboardApi", () => {
  it('should create a new dashboard after "createDashboard" is called', async () => {
    setup();

    await userEvent.click(screen.getByText("Create dashboard"));

    expect(
      fetchMock.calls(`path:/api/dashboard`, { method: "POST" }),
    ).toHaveLength(1);
  });

  it("should return dashboard api call response", async () => {
    const { onDashboardCreateSpy } = setup();

    await userEvent.click(screen.getByText("Create dashboard"));

    expect(onDashboardCreateSpy).toHaveBeenCalledTimes(1);
    expect(onDashboardCreateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: TEST_DASHBOARD_ID,
        name: TEST_DASHBOARD_NAME,
      }),
    );
  });
});

const TestComponent = (
  props: CreateDashboardValues & {
    onDashboardCreate: (dashboard: Dashboard) => void;
  },
) => {
  const { onDashboardCreate, ...restProps } = props;
  const { createDashboard } = useCreateDashboardApi();

  const handleCreate = async () => {
    const dashboard = await createDashboard(restProps);

    onDashboardCreate(dashboard);
  };

  return (
    <div>
      <button onClick={handleCreate}>Create dashboard</button>
    </div>
  );
};

function setup() {
  const mockProps = {
    name: TEST_DASHBOARD_NAME,
    description: null,
    collectionId: TEST_COLLECTION_ID,
  };

  setupDashboardCreateEndpoint({
    id: TEST_DASHBOARD_ID,
    collection_id: mockProps.collectionId,
    name: mockProps.name,
    description: mockProps.description,
  });

  const onDashboardCreateSpy = jest.fn();

  renderWithProviders(
    <TestComponent {...mockProps} onDashboardCreate={onDashboardCreateSpy} />,
    {
      mode: "sdk",
      sdkProviderProps: {
        config: createMockAuthProviderUriConfig(),
      },
    },
  );

  return {
    onDashboardCreateSpy,
  };
}
