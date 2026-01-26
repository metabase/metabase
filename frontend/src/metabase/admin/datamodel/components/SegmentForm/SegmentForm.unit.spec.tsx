import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardDataset,
  setupSchemaEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSegment,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SegmentForm } from "./SegmentForm";

type SetupOpts = {
  isTablePublished?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const setup = ({ remoteSyncType, isTablePublished }: SetupOpts) => {
  const db = createMockDatabase();
  const table = createMockTable({
    is_published: isTablePublished,
  });
  const segment = createMockSegment({
    name: "My wonderful segment",
    table,
  });

  setupTableEndpoints(table);
  setupCardDataset();
  setupSchemaEndpoints(db);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        remote_sync: true,
      }),
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    }),
  });

  setupEnterpriseOnlyPlugin("remote_sync");

  renderWithProviders(
    <SegmentForm
      onIsDirtyChange={jest.fn()}
      onSubmit={jest.fn()}
      segment={segment}
      updatePreviewSummary={jest.fn()}
    />,
    {
      storeInitialState: state,
    },
  );
};

const getNameInput = () => screen.getByLabelText("Name Your Segment");
const getDescriptionInput = () =>
  screen.getByLabelText("Describe Your Segment");

describe("SegmentForm", () => {
  describe("remote sync read-only mode", () => {
    it("should make form read-only when remote sync is read-only and table is published", async () => {
      await act(() => {
        setup({ remoteSyncType: "read-only", isTablePublished: true });
      });
      expect(getNameInput()).toHaveAttribute("readonly");
      expect(getDescriptionInput()).toHaveAttribute("readonly");
    });

    it("should not make form read-only when remote sync is read-only and table is not published", async () => {
      await act(() => {
        setup({ remoteSyncType: "read-only", isTablePublished: false });
      });
      expect(getNameInput()).not.toHaveAttribute("readonly");
      expect(getDescriptionInput()).not.toHaveAttribute("readonly");
    });

    it("should not make form read-only when remote sync is read-write and table is published", async () => {
      await act(() => {
        setup({ remoteSyncType: "read-write", isTablePublished: true });
      });
      expect(getNameInput()).not.toHaveAttribute("readonly");
      expect(getDescriptionInput()).not.toHaveAttribute("readonly");
    });

    it("should not make form read-only when remote sync is read-write and table is not published", async () => {
      await act(() => {
        setup({ remoteSyncType: "read-write", isTablePublished: false });
      });
      expect(getNameInput()).not.toHaveAttribute("readonly");
      expect(getDescriptionInput()).not.toHaveAttribute("readonly");
    });

    it("should not make form read-only when remote sync is not set and table is published", async () => {
      await act(() => {
        setup({ remoteSyncType: undefined, isTablePublished: true });
      });
      expect(getNameInput()).not.toHaveAttribute("readonly");
      expect(getDescriptionInput()).not.toHaveAttribute("readonly");
    });
  });
});
