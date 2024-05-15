import userEvent from "@testing-library/user-event";
import fetchMock, { type MockResponse } from "fetch-mock";

import { waitFor, renderWithProviders, screen } from "__support__/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { CloudPanel } from "./CloudPanel";

const setup = () => {
  const mockMigrationStart = jest.fn();

  renderWithProviders(
    <CloudPanel
      // TODO: get fake timers working - tet currently takes ~5s
      getPollingInterval={() => 250}
      onMigrationStart={mockMigrationStart}
    />,
  );

  return { mockMigrationStart };
};

describe("CloudPanel", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/session/properties", 200);
    fetchMock.post(`path:/api/cloud-migration`, INIT_RESPONSE);
  });

  // TODO: clean this up a bit
  // TODO: pull out shared logic for later tests
  // TODO: leave comments about what / why things are being asserts
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
    fetchMockCloudMigrationGetSequence(migrationResponses);
    const { mockMigrationStart } = setup();

    expect(
      await screen.findByText(
        "It only takes a few clicks to migrate this instance to Metabase Cloud.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Get started/ }));

    expect(
      await screen.findByText("Migrate this instance to Metabase Cloud now?"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Migrate now/ }));

    expect(mockMigrationStart).toHaveBeenCalledTimes(1);

    expect(
      await screen.findByText("You have started migration to Metabase Cloud"),
    ).toBeInTheDocument();

    const storeLink = screen.getByRole("link", { name: /Metabase Store/ });
    expect(storeLink).toBeInTheDocument();
    expect(storeLink).toHaveAttribute("href", STORE_LINK);

    expect(
      screen.getByRole("button", { name: /Cancel migration/ }),
    ).toBeInTheDocument();

    for (const { progress } of migrationProgressResponses) {
      await waitFor(async () => {
        expect(await screen.findByRole("progressbar")).toHaveAttribute(
          "aria-valuenow",
          `${progress}`,
        );
      });
    }

    expect(
      await screen.findByText("The snapshot has been uploaded to the Cloud"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Go to Metabase store/ }),
    ).toHaveAttribute("href", STORE_LINK);
  });

  it.todo("should be able to cancel a migration");
  // - start -> is started
  // - hit cancel -> is canceled

  it.todo("should show user error if something fails");
  // - start -> is started

  it.todo("should be able to start a new migration after a failed migration");
  // - error start
  // - try starting -> check is started

  it.todo(
    "should be able to start a new migration after a successful migration",
  );
  // - success start
  // - try starting -> check is started
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

// const ERROR_RESPONSE: CloudMigration = {
//   ...BASE_RESPONSE,
//   state: "error",
//   progress: 75,
//   updated_at: "2024-05-14T17:13:05.630546Z",
// };

// const CANCELED_RESPONSE: CloudMigration = {
//   ...BASE_RESPONSE,
//   state: "cancelled",
//   progress: 75,
//   updated_at: "2024-05-14T17:13:05.730546Z",
// };

const STORE_LINK = `https://store.staging.metabase.com/checkout?migration-id=${BASE_RESPONSE.external_id}`;

function fetchMockCloudMigrationGetSequence(responses: MockResponse[]) {
  let called = 0;
  return fetchMock.get(`path:/api/cloud-migration`, () => responses[called++], {
    repeat: responses.length,
  });
}
