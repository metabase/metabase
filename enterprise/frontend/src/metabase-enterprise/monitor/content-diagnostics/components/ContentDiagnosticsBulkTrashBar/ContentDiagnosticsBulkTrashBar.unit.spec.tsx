import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";
import {
  createMockCard,
  createMockContentDiagnosticsStaleFinding,
} from "metabase-types/api/mocks";

import { ContentDiagnosticsBulkTrashBar } from "./ContentDiagnosticsBulkTrashBar";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function card(
  opts: { id?: number; entity_id?: number } = {},
): ContentDiagnosticsBaseFinding {
  return createMockContentDiagnosticsStaleFinding({
    entity_type: "card",
    ...opts,
  });
}

function transform(
  opts: { id?: number; entity_id?: number } = {},
): ContentDiagnosticsBaseFinding {
  return createMockContentDiagnosticsStaleFinding({
    entity_type: "transform",
    ...opts,
  });
}

function setup(selectedFindings: ContentDiagnosticsBaseFinding[]) {
  const onSettled = jest.fn();
  const { store } = renderWithProviders(
    <ContentDiagnosticsBulkTrashBar
      tab="stale"
      selectedFindings={selectedFindings}
      onSettled={onSettled}
    />,
  );
  return { onSettled, store };
}

function hasUndo(store: ReturnType<typeof setup>["store"], message: string) {
  return store.getState().undo.some((undo) => undo.message === message);
}

describe("ContentDiagnosticsBulkTrashBar", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("uses recoverable trash wording for archivable-only selections", async () => {
    setup([card({ id: 1, entity_id: 1 }), card({ id: 2, entity_id: 2 })]);

    expect(screen.getByText("2 items selected")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Move 2 items to trash?"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("You can restore items from the trash."),
    ).toBeInTheDocument();
  });

  it("uses permanent-delete wording for transform-only selections", async () => {
    setup([transform({ id: 1, entity_id: 1 })]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 1 transform?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "1 transform will be permanently deleted and cannot be restored.",
      ),
    ).toBeInTheDocument();
  });

  it("warns about both outcomes for mixed selections", async () => {
    setup([card({ id: 1, entity_id: 1 }), transform({ id: 2, entity_id: 2 })]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Delete selected items?"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "1 item will be moved to the trash and can be restored later.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "1 transform will be permanently deleted and cannot be restored.",
      ),
    ).toBeInTheDocument();
  });

  it("hard-deletes a transform on confirm and reports it as a transform delete", async () => {
    fetchMock.delete("path:/api/transform/7", 204);
    const { onSettled } = setup([transform({ id: 1, entity_id: 7 })]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith([]);
    });

    expect(fetchMock.callHistory.calls("path:/api/transform/7")).toHaveLength(
      1,
    );
    expect(trackSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "transform_deleted",
        target_id: 7,
        triggered_from: "content_diagnostics",
        result: "success",
      }),
    );
  });

  it("archives on confirm, reports success, and clears the selection", async () => {
    setupCardEndpoints(createMockCard({ id: 1 }));
    const { onSettled, store } = setup([card({ id: 1, entity_id: 1 })]);

    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith([]);
    });

    const [putCall] = fetchMock.callHistory.calls("path:/api/card/1");
    expect(JSON.parse(String(putCall.options?.body))).toMatchObject({
      archived: true,
    });
    expect(hasUndo(store, "Moved 1 item to the trash")).toBe(true);
  });

  it("keeps failed items selected and warns when some entities can't be trashed", async () => {
    setupCardEndpoints(createMockCard({ id: 1 }));
    fetchMock.put("path:/api/card/2", { status: 500, body: {} });
    const { onSettled, store } = setup([
      card({ id: 1, entity_id: 1 }),
      card({ id: 2, entity_id: 2 }),
    ]);

    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith([2]);
    });
    expect(hasUndo(store, "Couldn't remove 1 item")).toBe(true);
    expect(trackSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "content_diagnostics_findings_bulk_trashed",
        triggered_from: "stale",
        event_detail: "1/2",
        result: "partial",
      }),
    );
  });

  it("tracks a fully trashed selection as a success", async () => {
    setupCardEndpoints(createMockCard({ id: 1 }));
    setupCardEndpoints(createMockCard({ id: 2 }));
    const { onSettled } = setup([
      card({ id: 1, entity_id: 1 }),
      card({ id: 2, entity_id: 2 }),
    ]);

    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Move to trash",
      }),
    );

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith([]);
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "content_diagnostics_findings_bulk_trashed",
        event_detail: "2/2",
        result: "success",
      }),
    );
  });

  it("tracks a selection where nothing could be trashed as a failure", async () => {
    fetchMock.put("path:/api/card/1", { status: 500, body: {} });
    const { onSettled } = setup([card({ id: 1, entity_id: 1 })]);

    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Move to trash",
      }),
    );

    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledWith([1]);
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "content_diagnostics_findings_bulk_trashed",
        event_detail: "0/1",
        result: "failure",
      }),
    );
  });
});
