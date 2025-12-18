import userEvent from "@testing-library/user-event";
import fetchMock, { type UserRouteConfig } from "fetch-mock";

import {
  setupBugReportingDetailsEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getPlan } from "metabase/common/utils/plan";
import type { CloudMigration } from "metabase-types/api/cloud-migration";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { CloudPanel } from "./CloudPanel";

const POLL_INTERVAL = 200;

const setup = () => {
  const mockMigrationStart = jest.fn();

  const { store } = renderWithProviders(
    <CloudPanel
      getPollingInterval={() => POLL_INTERVAL}
      onMigrationStart={mockMigrationStart}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );

  const storeUrl = store.getState().settings.values["store-url"];
  const plan = getPlan(store.getState().settings.values["token-features"]);
  const metabaseStoreLink = `${storeUrl}/checkout?migration-source-plan=${plan}&migration-id=${BASE_RESPONSE.external_id}`;

  return { mockMigrationStart, store, metabaseStoreLink };
};

describe("CloudPanel", () => {
  beforeEach(() => {
    setupPropertiesEndpoints(createMockSettings());
    fetchMock.post(`path:/api/cloud-migration`, INIT_RESPONSE);
    fetchMock.put(`path:/api/cloud-migration/cancel`, 200);
    setupBugReportingDetailsEndpoint({ "run-mode": "prod" });
  });

  it("should be able to successfully go through migration flow", async () => {
    const migrationProgressResponses = [
      INIT_RESPONSE,
      SETUP_RESPONSE,
      DUMP_RESPONSE,
      GET_UPLOAD_RESPONSE(60),
      GET_UPLOAD_RESPONSE(80),
    ];
    const migrationResponses = [
      UNINITIALIZED_RESPONSE,
      ...migrationProgressResponses,
      DONE_RESPONSE,
    ];

    const { metabaseStoreLink } = await startMigration(migrationResponses);

    await expectProgressState(metabaseStoreLink);

    // should see the progress bar update as progress increases
    for (const { progress } of migrationProgressResponses) {
      await waitFor(async () => {
        expect(await screen.findByRole("progressbar")).toHaveAttribute(
          "aria-valuenow",
          `${progress}`,
        );
      });
    }

    await expectSuccessState(metabaseStoreLink);
  });

  it("should be able to cancel a migration", async () => {
    const { store, metabaseStoreLink } = await startMigration([
      UNINITIALIZED_RESPONSE,
      INIT_RESPONSE,
      SETUP_RESPONSE,
    ]);

    await expectProgressState(metabaseStoreLink);

    const cancelButton = await screen.findByRole("button", {
      name: /Cancel migration/,
    });
    expect(cancelButton).toBeInTheDocument();
    await userEvent.click(cancelButton);

    await expectCancelConfirmationModal();
    expect((store.getState() as any).undo).toHaveLength(0);
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Cancel migration?" }),
      ).getByRole("button", { name: /Cancel migration/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(`path:/api/cloud-migration/cancel`, {
          method: "PUT",
        }),
      ).toBeTruthy();
    });
    expect((store.getState() as any).undo).toHaveLength(1);

    fetchMockCloudMigrationGetSequence([CANCELED_RESPONSE]);

    await expectInitState();
  });

  it("should show user error if something fails", async () => {
    const { metabaseStoreLink } = await startMigration([
      UNINITIALIZED_RESPONSE,
      INIT_RESPONSE,
      SETUP_RESPONSE,
      ERROR_RESPONSE,
    ]);

    await expectProgressState(metabaseStoreLink);

    await expectErrorState();
  });

  it("should be able to start a new migration after a failed migration", async () => {
    fetchMock.get(`path:/api/cloud-migration`, ERROR_RESPONSE, {
      name: "cloud-migration-get",
    });
    const { mockMigrationStart, metabaseStoreLink } = setup();

    await expectErrorState();
    await expectInitState();
    await userEvent.click(screen.getByRole("button", { name: "Try for free" }));

    await expectStartConfirmationModal();
    await userEvent.click(screen.getByRole("button", { name: /Migrate now/ }));

    fetchMockCloudMigrationGetSequence([
      { ...INIT_RESPONSE, id: 2 },
      { ...SETUP_RESPONSE, id: 2 },
    ]);

    await expectProgressState(metabaseStoreLink);

    expect(mockMigrationStart).toHaveBeenCalledTimes(1);
  });

  it("should be able to start a new migration after a successful migration", async () => {
    fetchMock.get(`path:/api/cloud-migration`, DONE_RESPONSE, {
      name: "cloud-migration-get",
    });

    const { mockMigrationStart, metabaseStoreLink } = setup();

    await expectSuccessState(metabaseStoreLink);

    await userEvent.click(
      await screen.findByRole("button", { name: /Restart the process/ }),
    );

    fetchMockCloudMigrationGetSequence([
      { ...INIT_RESPONSE, id: 2 },
      { ...SETUP_RESPONSE, id: 2 },
      { ...DUMP_RESPONSE, id: 2 },
    ]);

    await expectProgressState(metabaseStoreLink);

    expect(mockMigrationStart).toHaveBeenCalledTimes(1);
  });
});

const UNINITIALIZED_RESPONSE = 204;

const BASE_RESPONSE = {
  id: 1,
  external_id: "1234",
  upload_url: "https://test.com",
  created_at: "2024-05-14T17:13:05.130546Z",
};

const INIT_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "init",
  progress: 0,
  updated_at: "2024-05-14T17:13:05.130546Z",
};

const SETUP_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "setup",
  progress: 1,
  updated_at: "2024-05-14T17:13:05.230546Z",
};

const DUMP_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "dump",
  progress: 20,
  updated_at: "2024-05-14T17:13:05.330546Z",
};

const GET_UPLOAD_RESPONSE = (progress: number): CloudMigration => ({
  ...BASE_RESPONSE,
  state: "upload",
  progress,
  updated_at: "2024-05-14T17:13:05.430546Z",
});

const DONE_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "done",
  progress: 100,
  updated_at: "2024-05-14T17:13:05.530546Z",
};

const CANCELED_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "cancelled",
  progress: 75,
  updated_at: "2024-05-14T17:13:05.730546Z",
};

const ERROR_RESPONSE: CloudMigration = {
  ...BASE_RESPONSE,
  state: "error",
  progress: 75,
  updated_at: "2024-05-14T17:13:05.630546Z",
};

const expectInitState = async () => {
  expect(
    await screen.findByRole("heading", { name: "Migrate to Metabase Cloud" }),
  ).toBeInTheDocument();
};

const expectStartConfirmationModal = async () => {
  expect(
    await screen.findByText(/Get started with Metabase Cloud/),
  ).toBeInTheDocument();
};

const expectProgressState = async (storeUrl: string) => {
  expect(
    await screen.findByText("Migrating to Metabase Cloud…"),
  ).toBeInTheDocument();

  // expect to have correct store link for this exact migration
  const storeLink = screen.getByRole("link", { name: /Metabase Store/ });
  expect(storeLink).toBeInTheDocument();
  expect(storeLink).toHaveAttribute("href", storeUrl);
};

const expectSuccessState = async (storeUrl: string) => {
  expect(
    await screen.findByText("The snapshot has been uploaded to the Cloud"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Go to Metabase Store/ }),
  ).toHaveAttribute("href", storeUrl);
};

const expectCancelConfirmationModal = async () => {
  expect(await screen.findByText("Cancel migration?")).toBeInTheDocument();
};

const expectErrorState = async () => {
  expect(
    await screen.findByText(`Migration to Metabase Cloud failed`),
  ).toBeInTheDocument();
};

const startMigration = async (
  migrationResponses: UserRouteConfig["response"][],
) => {
  fetchMockCloudMigrationGetSequence(migrationResponses);
  const { mockMigrationStart, store, metabaseStoreLink } = setup();

  await expectInitState();
  await userEvent.click(screen.getByRole("button", { name: "Try for free" }));

  await expectStartConfirmationModal();
  await userEvent.click(screen.getByRole("button", { name: /Migrate now/ }));

  expect(mockMigrationStart).toHaveBeenCalledTimes(1);

  return { store, metabaseStoreLink };
};

function fetchMockCloudMigrationGetSequence(
  responses: UserRouteConfig["response"][],
) {
  let called = 0;
  fetchMock.removeRoute("cloud-migration-get");
  return fetchMock.get(
    `path:/api/cloud-migration`,
    () => {
      // hold the last response
      return responses[Math.min(called++, responses.length - 1)];
    },
    { name: "cloud-migration-get" },
  );
}
