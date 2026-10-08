import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import { setupCardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  useListDuplicatedFindingsQuery,
  useListImbalancedFindingsQuery,
  useListSlowFindingsQuery,
  useListStaleFindingsQuery,
} from "metabase-enterprise/api";
import type {
  ContentDiagnosticsBaseFinding,
  InvalidateFindingsResponse,
} from "metabase-types/api";
import {
  createMockCard,
  createMockContentDiagnosticsStaleFinding,
  createMockListDuplicatedFindingsResponse,
  createMockListImbalancedFindingsResponse,
  createMockListSlowFindingsResponse,
  createMockListStaleFindingsResponse,
} from "metabase-types/api/mocks";

import { ContentDiagnosticsBulkActionsBar } from "./ContentDiagnosticsBulkActionsBar";
import { useBulkDismissFindings } from "./use-bulk-dismiss-findings";

const { trackSimpleEvent, trackSchemaEvent } =
  jest.requireMock("metabase/analytics");

function card(
  opts: {
    id?: number;
    entity_id?: number;
    card_type?: "question" | "model" | "metric";
  } = {},
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

function TestBulkActionsBar(
  props: Omit<
    ComponentProps<typeof ContentDiagnosticsBulkActionsBar>,
    "dismissFindings" | "isDismissing"
  >,
) {
  const { dismissFindings, isDismissing } = useBulkDismissFindings();
  return (
    <ContentDiagnosticsBulkActionsBar
      {...props}
      dismissFindings={dismissFindings}
      isDismissing={isDismissing}
    />
  );
}

function setup(selectedFindings: ContentDiagnosticsBaseFinding[]) {
  const onSettled = jest.fn();
  const { store, rerender } = renderWithProviders(
    <TestBulkActionsBar
      tab="stale"
      selectedFindings={selectedFindings}
      onSettled={onSettled}
    />,
  );
  return { onSettled, store, rerender };
}

function hasUndo(store: ReturnType<typeof setup>["store"], message: string) {
  return store.getState().undo.some((undo) => undo.message === message);
}

describe("ContentDiagnosticsBulkActionsBar", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
    trackSchemaEvent.mockClear();
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
        "1 item will be moved to the trash and can be restored later. 1 transform will be permanently deleted and cannot be restored.",
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
      expect(onSettled).toHaveBeenCalledWith([], [1]);
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
      expect(onSettled).toHaveBeenCalledWith([], [1]);
    });

    const [putCall] = fetchMock.callHistory.calls("path:/api/card/1");
    expect(JSON.parse(String(putCall.options?.body))).toMatchObject({
      archived: true,
    });
    expect(hasUndo(store, "Moved 1 item to the trash")).toBe(true);
  });

  it.each(["model", "metric"] as const)(
    "tracks a trashed %s as its card subtype",
    async (cardType) => {
      setupCardEndpoints(createMockCard({ id: 1 }));
      const { onSettled } = setup([
        card({ id: 1, entity_id: 1, card_type: cardType }),
      ]);

      await userEvent.click(
        screen.getByRole("button", { name: "Move to trash" }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Move to trash",
        }),
      );
      await waitFor(() => expect(onSettled).toHaveBeenCalledWith([], [1]));
      expect(trackSchemaEvent).toHaveBeenCalledWith(
        "simple_event",
        expect.objectContaining({
          event: "moved-to-trash",
          event_detail: cardType,
        }),
      );
    },
  );

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
      expect(onSettled).toHaveBeenCalledWith([2], [1, 2]);
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

  it("does not trash or track when the selected finding disappears before confirmation", async () => {
    const { rerender, onSettled, store } = setup([
      card({ id: 1, entity_id: 1 }),
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    const dialog = await screen.findByRole("dialog");

    rerender(
      <TestBulkActionsBar
        tab="stale"
        selectedFindings={[]}
        onSettled={onSettled}
      />,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    expect(onSettled).not.toHaveBeenCalled();
    expect(hasUndo(store, "Moved 0 items to the trash")).toBe(false);
    expect(trackSimpleEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: "content_diagnostics_findings_bulk_trashed",
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
      expect(onSettled).toHaveBeenCalledWith([], [1, 2]);
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
      expect(onSettled).toHaveBeenCalledWith([1], [1]);
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "content_diagnostics_findings_bulk_trashed",
        event_detail: "0/1",
        result: "failure",
      }),
    );
  });

  describe("dismiss", () => {
    const endpoint = "path:/api/ee/content-diagnostics/invalidate";

    async function openConfirmation(name = "Dismiss finding") {
      await userEvent.click(screen.getByRole("button", { name }));
      return screen.findByRole("dialog");
    }

    it.each([
      { count: 1, label: "Dismiss finding" },
      { count: 2, label: "Dismiss findings" },
    ])(
      "labels both dismissal actions for $count selected findings",
      async ({ count, label }) => {
        setup(
          Array.from({ length: count }, (_, index) => card({ id: index + 1 })),
        );

        await userEvent.click(screen.getByRole("button", { name: label }));
        const dialog = await screen.findByRole("dialog");
        expect(
          within(dialog).getByRole("button", { name: label }),
        ).toBeEnabled();
        expect(
          within(dialog).getByRole("button", { name: "Cancel" }),
        ).toBeEnabled();
      },
    );

    it("dismisses mixed finding types using finding IDs without deleting content", async () => {
      fetchMock.post(endpoint, { invalidated: [11, 22], skipped: [] });
      const { onSettled, store } = setup([
        card({ id: 11, entity_id: 101 }),
        transform({ id: 22, entity_id: 202 }),
      ]);
      const dialog = await openConfirmation("Dismiss findings");
      expect(
        within(dialog).getByText(
          "Dismissed findings will be hidden for everyone. The underlying content will not be deleted.",
        ),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls(endpoint)).toHaveLength(0);
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Dismiss findings" }),
      );
      await waitFor(() => expect(onSettled).toHaveBeenCalledWith([], [11, 22]));
      const calls = fetchMock.callHistory.calls(endpoint);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0].options.body))).toEqual({
        ids: [11, 22],
      });
      expect(
        fetchMock.callHistory
          .calls()
          .filter(
            ({ options }) =>
              options.method === "PUT" || options.method === "DELETE",
          ),
      ).toHaveLength(0);
      expect(hasUndo(store, "Dismissed 2 findings")).toBe(true);
    });

    it("refreshes findings across every diagnostics tab after dismissal", async () => {
      let dismissed = false;
      const getTotal = () => (dismissed ? 0 : 1);
      fetchMock.get("path:/api/ee/content-diagnostics/stale", () =>
        createMockListStaleFindingsResponse({ total: getTotal() }),
      );
      fetchMock.get("path:/api/ee/content-diagnostics/slow", () =>
        createMockListSlowFindingsResponse({ total: getTotal() }),
      );
      fetchMock.get("path:/api/ee/content-diagnostics/duplicated", () =>
        createMockListDuplicatedFindingsResponse({ total: getTotal() }),
      );
      fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", () =>
        createMockListImbalancedFindingsResponse({ total: getTotal() }),
      );
      fetchMock.post(endpoint, () => {
        dismissed = true;
        return { invalidated: [11], skipped: [] };
      });

      function DiagnosticsCounts() {
        const stale = useListStaleFindingsQuery({});
        const slow = useListSlowFindingsQuery({});
        const duplicated = useListDuplicatedFindingsQuery({});
        const imbalanced = useListImbalancedFindingsQuery({});
        return (
          <>
            <div>Stale: {stale.data?.total}</div>
            <div>Slow: {slow.data?.total}</div>
            <div>Duplicated: {duplicated.data?.total}</div>
            <div>Imbalanced: {imbalanced.data?.total}</div>
          </>
        );
      }

      renderWithProviders(
        <>
          <DiagnosticsCounts />
          <TestBulkActionsBar
            tab="stale"
            selectedFindings={[card({ id: 11 })]}
            onSettled={jest.fn()}
          />
        </>,
      );
      for (const tab of ["Stale", "Slow", "Duplicated", "Imbalanced"]) {
        expect(await screen.findByText(`${tab}: 1`)).toBeInTheDocument();
      }
      const dialog = await openConfirmation();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Dismiss finding" }),
      );
      for (const tab of ["Stale", "Slow", "Duplicated", "Imbalanced"]) {
        expect(await screen.findByText(`${tab}: 0`)).toBeInTheDocument();
      }
    });

    it("does not dismiss when confirmation is canceled", async () => {
      const { onSettled } = setup([card({ id: 11 })]);
      const dialog = await openConfirmation();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );
      expect(fetchMock.callHistory.calls(endpoint)).toHaveLength(0);
      expect(onSettled).not.toHaveBeenCalled();
    });

    it("preserves selection on error and allows retry", async () => {
      let failed = true;
      fetchMock.post(endpoint, () =>
        failed
          ? { status: 500, body: { message: "Dismiss failed" } }
          : { invalidated: [11], skipped: [] },
      );
      const { onSettled, store } = setup([card({ id: 11 })]);
      const dialog = await openConfirmation();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Dismiss finding" }),
      );
      await waitFor(() => expect(hasUndo(store, "Dismiss failed")).toBe(true));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onSettled).not.toHaveBeenCalled();
      failed = false;
      const retryDialog = await openConfirmation();
      await userEvent.click(
        within(retryDialog).getByRole("button", { name: "Dismiss finding" }),
      );
      await waitFor(() => expect(onSettled).toHaveBeenCalledWith([], [11]));
      expect(fetchMock.callHistory.calls(endpoint)).toHaveLength(2);
    });

    it.each([
      { invalidated: [11], skipped: [22], message: "Dismissed 1 finding" },
      {
        invalidated: [],
        skipped: [11, 22],
        message: "No findings were dismissed",
      },
    ])(
      "reports the actual dismissed count: $message",
      async ({ invalidated, skipped, message }) => {
        fetchMock.post(endpoint, { invalidated, skipped });
        const { onSettled, store } = setup([
          card({ id: 11 }),
          card({ id: 22 }),
        ]);
        const dialog = await openConfirmation("Dismiss findings");
        await userEvent.click(
          within(dialog).getByRole("button", { name: "Dismiss findings" }),
        );
        await waitFor(() =>
          expect(onSettled).toHaveBeenCalledWith([], [11, 22]),
        );
        expect(hasUndo(store, message)).toBe(true);
      },
    );

    it("closes confirmation immediately and blocks duplicate requests while pending", async () => {
      let resolveResponse: (
        response: InvalidateFindingsResponse,
      ) => void = () => {
        throw new Error("response not initialized");
      };
      fetchMock.post(
        endpoint,
        () =>
          new Promise<InvalidateFindingsResponse>((resolve) => {
            resolveResponse = resolve;
          }),
      );
      const { onSettled } = setup([card({ id: 11 })]);
      const dialog = await openConfirmation();
      const confirm = within(dialog).getByRole("button", {
        name: "Dismiss finding",
      });
      await userEvent.click(confirm);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      const dismiss = screen.getByRole("button", { name: "Dismiss finding" });
      expect(dismiss).toBeDisabled();
      await userEvent.click(dismiss);
      expect(fetchMock.callHistory.calls(endpoint)).toHaveLength(1);
      resolveResponse({ invalidated: [11], skipped: [] });
      await waitFor(() => expect(onSettled).toHaveBeenCalledWith([], [11]));
    });

    it("does not send an empty selection if findings disappear before confirmation", async () => {
      const { rerender, onSettled } = setup([card({ id: 11 })]);
      const dialog = await openConfirmation();
      rerender(
        <TestBulkActionsBar
          tab="stale"
          selectedFindings={[]}
          onSettled={onSettled}
        />,
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Dismiss findings" }),
      );
      expect(fetchMock.callHistory.calls(endpoint)).toHaveLength(0);
      expect(onSettled).not.toHaveBeenCalled();
    });
  });
});
