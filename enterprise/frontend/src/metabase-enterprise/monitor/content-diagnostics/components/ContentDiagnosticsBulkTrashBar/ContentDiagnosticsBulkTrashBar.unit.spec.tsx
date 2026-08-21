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
  });
});
