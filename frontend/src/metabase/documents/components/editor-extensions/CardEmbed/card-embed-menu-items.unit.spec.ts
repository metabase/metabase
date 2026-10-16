import { getCardEmbedMenuItems } from "./card-embed-menu-items";

type Options = Parameters<typeof getCardEmbedMenuItems>[0];

const READER_IN_EDITOR: Options = {
  canEdit: true,
  canWrite: false,
  canOpenComments: true,
  canAddSupportingText: true,
  canDownloadResults: true,
  hasTimelineEvents: false,
  isStatic: false,
  isInIframe: false,
};

describe("getCardEmbedMenuItems", () => {
  it("disables the edit items in an editor the user cannot write to", () => {
    expect(getCardEmbedMenuItems(READER_IN_EDITOR)).toEqual([
      { id: "add-supporting-text", isEnabled: false },
      { id: "edit-visualization", isEnabled: false },
      { id: "edit-query", isEnabled: false },
      { id: "replace", isEnabled: false },
      { id: "download", isEnabled: true },
      { id: "remove", isEnabled: false },
    ]);
  });

  it("enables every item for a writer", () => {
    expect(
      getCardEmbedMenuItems({
        ...READER_IN_EDITOR,
        canWrite: true,
        hasTimelineEvents: true,
      }),
    ).toEqual([
      { id: "comment", isEnabled: true },
      { id: "add-supporting-text", isEnabled: true },
      { id: "edit-visualization", isEnabled: true },
      { id: "edit-timeline-events", isEnabled: true },
      { id: "edit-query", isEnabled: true },
      { id: "replace", isEnabled: true },
      { id: "download", isEnabled: true },
      { id: "remove", isEnabled: true },
    ]);
  });

  it("leaves out the items it cannot use on a surface that cannot edit", () => {
    expect(
      getCardEmbedMenuItems({ ...READER_IN_EDITOR, canEdit: false }),
    ).toEqual([{ id: "download", isEnabled: true }]);
  });

  it("has no items on a surface that cannot edit when results cannot be downloaded", () => {
    expect(
      getCardEmbedMenuItems({
        ...READER_IN_EDITOR,
        canEdit: false,
        canDownloadResults: false,
      }),
    ).toEqual([]);
  });
});
