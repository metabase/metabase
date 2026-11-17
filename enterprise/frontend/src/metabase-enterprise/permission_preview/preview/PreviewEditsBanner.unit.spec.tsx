import { renderWithProviders, screen } from "__support__/ui";

import type { UnsavedEdit } from "../api";

import { type PreviewEdits, PreviewEditsSheet } from "./PreviewEditsBanner";

const EDIT: UnsavedEdit = {
  group_id: 3,
  group_name: "Sales",
  database_id: 1,
  table_id: 2,
  label: "Orders",
  permission: "view-data",
  before: "unrestricted",
  after: "blocked",
};

const EDIT_BAR_BOTTOM_PX = 52;

describe("PreviewEditsSheet", () => {
  afterEach(() => {
    document.querySelector('[data-testid="edit-bar"]')?.remove();
  });

  it("starts the See changes sheet below the permissions edit bar", () => {
    setup({ isSheetOpen: true });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue("--mb-sidesheet-top"),
    ).toBe(`${EDIT_BAR_BOTTOM_PX}px`);
  });

  it("leaves the sheet's offset alone once it's closed", () => {
    const { unmount } = setup({ isSheetOpen: true });
    unmount();

    expect(
      document.documentElement.style.getPropertyValue("--mb-sidesheet-top"),
    ).toBe("");
  });
});

type SetupOpts = { isSheetOpen: boolean };

function setup({ isSheetOpen }: SetupOpts) {
  const editBar = document.createElement("div");
  editBar.dataset.testid = "edit-bar";
  editBar.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 0, width: 1440, height: EDIT_BAR_BOTTOM_PX });
  document.body.append(editBar);

  const previewEdits: PreviewEdits = {
    edits: [EDIT],
    hasEdits: true,
    isWithEdits: true,
    setIsWithEdits: jest.fn(),
    isSheetOpen,
    setIsSheetOpen: jest.fn(),
    unsavedEditsId: "edits-1",
    isKeeping: false,
  };

  return renderWithProviders(
    <PreviewEditsSheet
      previewEdits={previewEdits}
      principal={null}
      onNavigate={jest.fn()}
    />,
  );
}
