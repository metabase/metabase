import { createScenario } from "__support__/scenarios";
import {
  setupCardDataset,
  setupSchemaEndpoints,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { act, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

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

  const { render } = createScenario()
    .withEnterprise({
      plugins: ["remote_sync"],
      tokenFeatures: { remote_sync: true },
    })
    .withSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    })
    .build();

  render(
    <SegmentForm
      onIsDirtyChange={jest.fn()}
      onSubmit={jest.fn()}
      segment={segment}
    />,
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
