import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupDashboardCreateEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import { renderWithSDKProviders } from "embedding-sdk/test/__support__/ui";
import { createMockAuthProviderUriConfig } from "embedding-sdk/test/mocks/config";
import { setupSdkState } from "embedding-sdk/test/server-mocks/sdk-init";
import type { MetabaseDashboard } from "embedding-sdk/types/dashboard";
import { createMockUser } from "metabase-types/api/mocks";

import type { CreateDashboardValues } from "./use-create-dashboard-api";
import { useCreateDashboardApi } from "./use-create-dashboard-api";

const TEST_COLLECTION_ID = 11;
const TEST_DASHBOARD_ID = 123;
const TEST_DASHBOARD_NAME = "TestDashboard";
const TEST_PERSONAL_COLLECTION_ID = 42;

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

  it("should create a dashboard in the personal collection when collectionId is 'personal'", async () => {
    setup({ collectionId: "personal" });

    await userEvent.click(screen.getByText("Create dashboard"));

    const calls = fetchMock.calls(`path:/api/dashboard`, { method: "POST" });
    expect(calls).toHaveLength(1);

    const [_url, options] = calls[0];

    const requestBody = (await options?.body) as string;
    expect(JSON.parse(requestBody)).toMatchObject({
      collection_id: TEST_PERSONAL_COLLECTION_ID,
    });
  });
});

const TestComponent = (
  props: CreateDashboardValues & {
    onDashboardCreate: (dashboard: MetabaseDashboard) => void;
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

type SetupProps = Partial<{
  name: string;
  description: string | null;
  collectionId: number | "personal";
}>;

function setup(overrides: SetupProps = {}) {
  const mockProps = {
    name: TEST_DASHBOARD_NAME,
    description: null,
    collectionId: TEST_COLLECTION_ID,
    ...overrides,
  };

  setupDashboardCreateEndpoint({
    id: TEST_DASHBOARD_ID,
    collection_id: mockProps.collectionId,
    name: mockProps.name,
    description: mockProps.description,
  });

  const onDashboardCreateSpy = jest.fn();

  const { state } = setupSdkState({
    currentUser: createMockUser({
      personal_collection_id: TEST_PERSONAL_COLLECTION_ID,
    }),
  });

  renderWithSDKProviders(
    <TestComponent {...mockProps} onDashboardCreate={onDashboardCreateSpy} />,
    {
      storeInitialState: state,
      sdkProviderProps: {
        authConfig: createMockAuthProviderUriConfig(),
      },
    },
  );

  return {
    onDashboardCreateSpy,
  };
}
