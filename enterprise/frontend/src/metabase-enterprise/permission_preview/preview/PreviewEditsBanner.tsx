import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { getGroupFocusPermissionsUrl } from "metabase/permissions";
import { Box, Stack, Text } from "metabase/ui";

import { UnsavedEditsBanner, UnsavedEditsSheet } from "../UnsavedEditsBanner";
import type { PreviewPrincipal } from "../api";
import { outlineGridCell } from "../grid-outline";
import { getEditDataPermission, useUnsavedEdits } from "../unsaved-edits";

import { getWhoName } from "./PrincipalHeader";

export type PreviewEdits = ReturnType<typeof usePreviewEdits>;

/**
 * A permissions page preview's unsaved edits: whether it shows them ("With my changes", the default), and the id to
 * fetch it with. `isKeeping` is true while the edits are on their way to the server, when the preview must wait.
 */
export function usePreviewEdits() {
  const unsavedEdits = useUnsavedEdits();
  const [isWithEdits, setIsWithEdits] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const hasEdits = unsavedEdits.edits.length > 0;
  const unsavedEditsId =
    hasEdits && isWithEdits ? unsavedEdits.unsavedEditsId : undefined;
  return {
    edits: unsavedEdits.edits,
    hasEdits,
    isWithEdits,
    setIsWithEdits,
    isSheetOpen,
    setIsSheetOpen,
    unsavedEditsId,
    isKeeping: hasEdits && isWithEdits && unsavedEditsId == null,
  };
}

type PreviewEditsBannerProps = {
  previewEdits: PreviewEdits;
  /** Null on a table's preview, which lists every user. */
  principal: PreviewPrincipal | null;
};

/** The unsaved-edits banner above a preview on the permissions page. */
export function PreviewEditsBanner({
  previewEdits,
  principal,
}: PreviewEditsBannerProps) {
  const { edits, isWithEdits, setIsWithEdits, isSheetOpen, setIsSheetOpen } =
    previewEdits;
  const whoName = principal != null ? getWhoName(principal) : null;
  return (
    // the editor pads only its left side (`pl="xxl"`); the banner mirrors it so it doesn't run to the edge
    <Stack gap="xs" mb="md" mr="xxl">
      <Box
        style={{ borderRadius: "var(--mantine-radius-md)", overflow: "hidden" }}
      >
        <UnsavedEditsBanner
          count={edits.length}
          isWithEdits={isWithEdits}
          onIsWithEditsChange={setIsWithEdits}
          isSheetOpen={isSheetOpen}
          onSheetToggle={() => setIsSheetOpen(!isSheetOpen)}
        />
      </Box>
      {isWithEdits && (
        <Text c="text-secondary">
          {whoName != null
            ? t`Showing what ${whoName} will see once you save. Until then, nobody sees these changes.`
            : t`Showing what each user will see once you save. Until then, nobody sees these changes.`}
        </Text>
      )}
    </Stack>
  );
}

type PreviewEditsSheetProps = {
  previewEdits: PreviewEdits;
  principal: PreviewPrincipal | null;
  onNavigate: (url: string) => void;
};

/** "See changes" on the permissions page, where "Show in grid" opens the edited group's cell. */
export function PreviewEditsSheet({
  previewEdits,
  principal,
  onNavigate,
}: PreviewEditsSheetProps) {
  const { edits, isSheetOpen, setIsSheetOpen } = previewEdits;
  const isOpen = isSheetOpen && edits.length > 0;
  useSheetBelowEditBar(isOpen);
  return (
    <UnsavedEditsSheet
      isOpen={isOpen}
      edits={edits}
      whoName={principal != null ? getWhoName(principal) : null}
      principalGroupIds={principal?.groups.map((group) => group.id) ?? null}
      onShowInGrid={(edit) => {
        setIsSheetOpen(false);
        // the grid level the edit was made on: a table's row in its database, a database's row in the group's list
        const url =
          edit.table_id != null
            ? getGroupFocusPermissionsUrl(edit.group_id, {
                databaseId: edit.database_id,
              })
            : getGroupFocusPermissionsUrl(edit.group_id);
        const permission = getEditDataPermission(edit);
        if (permission != null) {
          outlineGridCell(url, {
            entityId: {
              databaseId: edit.database_id,
              ...(edit.table_id != null && { tableId: edit.table_id }),
            },
            permission,
          });
        }
        onNavigate(url);
      }}
      onClose={() => setIsSheetOpen(false)}
    />
  );
}

// Core's sheet starts at this offset from the top of the window, 0 unless set (`sidesheet.module.css`).
const SIDESHEET_TOP_PROPERTY = "--mb-sidesheet-top";

/** The sheet starts below the permissions edit bar, so its Cancel and Save changes stay in view. */
function useSheetBelowEditBar(isOpen: boolean) {
  useLayoutEffect(() => {
    const editBar = document.querySelector('[data-testid="edit-bar"]');
    if (!isOpen || editBar == null) {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty(
      SIDESHEET_TOP_PROPERTY,
      `${editBar.getBoundingClientRect().bottom}px`,
    );
    return () => {
      root.style.removeProperty(SIDESHEET_TOP_PROPERTY);
    };
  }, [isOpen]);
}
