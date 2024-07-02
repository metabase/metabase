/* eslint-disable jest/expect-expect */

import userEvent from "@testing-library/user-event";
import fetchMock, { type MockResponse } from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { waitFor, renderWithProviders, screen } from "__support__/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";
import { createMockSettings } from "metabase-types/api/mocks";

import { CloudPanel } from "./CloudPanel";

const POLL_INTERVAL = 200;

const setup = () => {
  const mockMigrationStart = jest.fn();

  const { store } = renderWithProviders(
    <CloudPanel
      getPollingInterval={() => POLL_INTERVAL}
      onMigrationStart={mockMigrationStart}
    />,
  );

  const STORE_URL = store.getState().settings.values["store-url"];
  const metabaseStoreLink = `${STORE_URL}/checkout?migration-id=${BASE_RESPONSE.external_id}`;

  return { mockMigrationStart, store, metabaseStoreLink };
};

describe("CloudPanel", () => {
  beforeEach(() => {
    setupPropertiesEndpoints(createMockSettings());
    fetchMock.post(`path:/api/cloud-migration`, INIT_RESPONSE);
    fetchMock.put(`path:/api/cloud-migration/cancel`, 200);
    fetchMock.get("path:/api/util/bug_report_details", {
      "metabase-info": { "run-mode": "prod" },
    });
  });

  afterEach(() => {
    fetchMock.reset();
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
      screen.getByRole("button", { name: /Cancel migration/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.called(`path:/api/cloud-migration/cancel`, {
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
    fetchMock.get(`path:/api/cloud-migration`, ERROR_RESPONSE);
    const { mockMigrationStart, metabaseStoreLink } = setup();

    await expectErrorState();
    await expectInitState();
    await userEvent.click(screen.getByRole("button", { name: /Get started/ }));

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
    fetchMock.get(`path:/api/cloud-migration`, DONE_RESPONSE);

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
    await screen.findByText(/Migrate this instance to Metabase Cloud/),
  ).toBeInTheDocument();
};

const expectStartConfirmationModal = async () => {
  expect(
    await screen.findByText(/Get started with Metabase Cloud/),
  ).toBeInTheDocument();
};

const expectProgressState = async (STORE_LINK: string) => {
  expect(
    await screen.findByText("Migrating to Metabase Cloud…"),
  ).toBeInTheDocument();

  // expect to have correct store link for this exact migration
  const storeLink = screen.getByRole("link", { name: /Metabase Store/ });
  expect(storeLink).toBeInTheDocument();
  expect(storeLink).toHaveAttribute("href", STORE_LINK);
};

const expectSuccessState = async (STORE_LINK: string) => {
  expect(
    await screen.findByText("The snapshot has been uploaded to the Cloud"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Go to Metabase Store/ }),
  ).toHaveAttribute("href", STORE_LINK);
};

const expectCancelConfirmationModal = async () => {
  expect(await screen.findByText("Cancel migration?")).toBeInTheDocument();
};

const expectErrorState = async () => {
  expect(
    await screen.findByText(`Migration to Metabase Cloud failed`),
  ).toBeInTheDocument();
};

const startMigration = async (migrationResponses: MockResponse[]) => {
  fetchMockCloudMigrationGetSequence(migrationResponses);
  const { mockMigrationStart, store, metabaseStoreLink } = setup();

  await expectInitState();
  await userEvent.click(screen.getByRole("button", { name: /Get started/ }));

  await expectStartConfirmationModal();
  await userEvent.click(screen.getByRole("button", { name: /Migrate now/ }));

  expect(mockMigrationStart).toHaveBeenCalledTimes(1);

  return { store, metabaseStoreLink };
};

function fetchMockCloudMigrationGetSequence(responses: MockResponse[]) {
  let called = 0;

  return fetchMock.get(
    `path:/api/cloud-migration`,
    () => {
      // hold the last response
      return responses[Math.min(called++, responses.length - 1)];
    },
    {
      overwriteRoutes: true,
    },
  );
}
