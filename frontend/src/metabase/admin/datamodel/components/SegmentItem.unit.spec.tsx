import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupSchemaEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSegment,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { SegmentItem } from "./SegmentItem";

type SetupOpts = {
  isTablePublished?: boolean;
  isTablePending?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({
  isTablePublished,
  isTablePending = false,
  remoteSyncType,
}: SetupOpts) => {
  const database = createMockDatabase();
  const table = createMockTable({ is_published: isTablePublished });
  const segment = createMockSegment({ name: "Discounted", table_id: table.id });

  setupSchemaEndpoints(database);
  // The global afterEach flushes outstanding requests, so a pending response
  // has to stay resolvable.
  let resolveTable = () => {};
  if (isTablePending) {
    fetchMock.get(
      `path:/api/table/${table.id}`,
      new Promise((resolve) => {
        resolveTable = () => resolve(table);
      }),
    );
  } else {
    setupTableEndpoints(table);
  }

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ remote_sync: true }),
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    }),
  });

  setupEnterpriseOnlyPlugin("remote_sync");

  renderWithProviders(
    <table>
      <tbody>
        <SegmentItem segment={segment} onRetire={jest.fn()} />
      </tbody>
    </table>,
    { storeInitialState: state },
  );

  return { resolveTable };
};

const openActionMenu = async () => {
  await userEvent.click(screen.getByRole("button"));
};

describe("SegmentItem", () => {
  it("offers the write actions when remote sync is not read-only", async () => {
    setup({ isTablePublished: true });
    await openActionMenu();

    expect(await screen.findByText("Retire Segment")).toBeInTheDocument();
    expect(screen.getByText("Edit Segment")).toBeInTheDocument();
  });

  it("offers the write actions for an unpublished table in read-only remote sync", async () => {
    setup({ isTablePublished: false, remoteSyncType: "read-only" });
    await openActionMenu();

    expect(await screen.findByText("Retire Segment")).toBeInTheDocument();
    expect(screen.getByText("Edit Segment")).toBeInTheDocument();
  });

  it("hides the write actions for a published table in read-only remote sync", async () => {
    setup({ isTablePublished: true, remoteSyncType: "read-only" });
    await openActionMenu();

    expect(await screen.findByText("Revision History")).toBeInTheDocument();
    expect(screen.queryByText("Retire Segment")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit Segment")).not.toBeInTheDocument();
  });

  it("hides the write actions while the table is still loading", async () => {
    const { resolveTable } = setup({
      isTablePending: true,
      remoteSyncType: "read-only",
    });
    await openActionMenu();

    expect(await screen.findByText("Revision History")).toBeInTheDocument();
    expect(screen.queryByText("Retire Segment")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit Segment")).not.toBeInTheDocument();

    resolveTable();
  });
});
