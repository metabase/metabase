import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupListTransformTagsEndpoint,
  setupReplaceModelWithTransformEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { ReplaceWithTransformModal } from "./ReplaceWithTransformModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DATABASE = createMockDatabase({ id: 1 });
const CARD = createMockCard({ id: 10, name: "My Model", database_id: 1 });

const REPLACE_URL = "path:/api/ee/replacement/replace-model-with-transform";

type SetupOpts = {
  replaceShouldFail?: boolean;
};

function setup({ replaceShouldFail = false }: SetupOpts = {}) {
  const onClose = jest.fn();

  setupDatabaseEndpoints(DATABASE);
  setupListTransformTagsEndpoint([]);
  fetchMock.get(
    "path:/api/collection/root",
    createMockCollection({ id: "root", name: "Our analytics" }),
  );

  if (replaceShouldFail) {
    fetchMock.post(REPLACE_URL, { status: 500, body: { message: "boom" } });
  } else {
    setupReplaceModelWithTransformEndpoint();
  }

  renderWithProviders(
    <ReplaceWithTransformModal card={CARD} opened onClose={onClose} />,
  );

  return { onClose };
}

async function clickConvert() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Convert to a transform" }),
  );
}

describe("ReplaceWithTransformModal analytics", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("tracks the migration started and success when the conversion succeeds", async () => {
    const { onClose } = setup();

    await clickConvert();

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "model_to_transforms_migration_started",
      target_id: 10,
    });
    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "model_to_transforms_migration_success",
        target_id: 10,
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("tracks the migration started and failure when the conversion fails", async () => {
    const { onClose } = setup({ replaceShouldFail: true });

    await clickConvert();

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "model_to_transforms_migration_started",
      target_id: 10,
    });
    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "model_to_transforms_migration_failure",
        target_id: 10,
      });
    });
    expect(trackSimpleEvent).not.toHaveBeenCalledWith({
      event: "model_to_transforms_migration_success",
      target_id: 10,
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
