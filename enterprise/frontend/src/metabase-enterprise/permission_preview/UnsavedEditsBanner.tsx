import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import {
  Anchor,
  Badge,
  Button,
  Flex,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import type { GroupId } from "metabase-types/api";

import type { UnsavedEdit } from "./api";

type UnsavedEditsBandSectionProps = {
  count: number;
  isWithEdits: boolean;
  isSheetOpen: boolean;
  onSheetToggle: () => void;
};

/**
 * In the band, after who is previewed: whether the preview includes the admin's unsaved permission edits, and "See
 * changes", which toggles an `UnsavedEditsSheet`. It goes away when the edits are saved or cancelled.
 */
export function UnsavedEditsBandSection({
  count,
  isWithEdits,
  isSheetOpen,
  onSheetToggle,
}: UnsavedEditsBandSectionProps) {
  return (
    <Flex align="center" gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Text c="text-primary" style={{ whiteSpace: "nowrap" }}>
        {isWithEdits
          ? ngettext(
              msgid`· ${count} unsaved change included`,
              `· ${count} unsaved changes included`,
              count,
            )
          : ngettext(
              msgid`· ${count} unsaved change left out`,
              `· ${count} unsaved changes left out`,
              count,
            )}
      </Text>
      <Button
        size="compact-sm"
        variant="subtle"
        c="text-primary"
        aria-pressed={isSheetOpen}
        onClick={onSheetToggle}
      >
        {t`See changes`}
      </Button>
    </Flex>
  );
}

type UnsavedEditsSheetProps = {
  isOpen: boolean;
  edits: UnsavedEdit[];
  isWithEdits: boolean;
  onIsWithEditsChange: (isWithEdits: boolean) => void;
  /** While the preview restarts with or without the edits. */
  isSwitchDisabled?: boolean;
  /** "Sandy Sales"; null while the preview loads, and on a table's preview, which lists every user. */
  whoName: string | null;
  /** The previewed person's groups, for each edit's "Affects …" badge. */
  principalGroupIds: GroupId[] | null;
  /** On the permissions page each edit links to its cell; in full screen the sheet is read-only. */
  onShowInGrid?: (edit: UnsavedEdit) => void;
  onClose: () => void;
};

/**
 * "See changes": a switch between the preview with and without the edits, then the unsaved edits by group, each saying
 * whether it changes what the previewed person gets.
 */
export function UnsavedEditsSheet({
  isOpen,
  edits,
  isWithEdits,
  onIsWithEditsChange,
  isSwitchDisabled = false,
  whoName,
  principalGroupIds,
  onShowInGrid,
  onClose,
}: UnsavedEditsSheetProps) {
  const count = edits.length;
  const affecting = edits.filter((edit) =>
    principalGroupIds?.includes(edit.group_id),
  ).length;
  const editsByGroup = Object.values(
    _.groupBy(edits, (edit) => String(edit.group_id)),
  );

  return (
    <Sidesheet
      title={ngettext(
        msgid`${count} unsaved change`,
        `${count} unsaved changes`,
        count,
      )}
      isOpen={isOpen}
      onClose={onClose}
      withOverlay={false}
      isModal={false}
    >
      <SegmentedControl
        aria-label={t`Unsaved changes in the preview`}
        disabled={isSwitchDisabled}
        data={[
          { value: "with", label: t`With my changes` },
          { value: "without", label: t`Without` },
        ]}
        value={isWithEdits ? "with" : "without"}
        onChange={(value) => onIsWithEditsChange(value === "with")}
      />
      {whoName != null && principalGroupIds != null && (
        <Text c="text-secondary">
          {ngettext(
            msgid`${affecting} change affects ${whoName}`,
            `${affecting} changes affect ${whoName}`,
            affecting,
          )}
        </Text>
      )}
      {editsByGroup.map((groupEdits) => (
        <SidesheetCard
          key={groupEdits[0].group_id}
          title={groupEdits[0].group_name}
        >
          <Stack gap="md">
            {groupEdits.map((edit, index) => (
              <EditRow
                key={index}
                edit={edit}
                whoName={whoName}
                isAffecting={principalGroupIds?.includes(edit.group_id)}
                onShowInGrid={onShowInGrid}
              />
            ))}
          </Stack>
        </SidesheetCard>
      ))}
      <Text c="text-secondary">
        {onShowInGrid
          ? t`Save or cancel in the bar above.`
          : t`You can't edit permissions in a preview. Exit the preview to keep editing. Your changes stay unsaved.`}
      </Text>
    </Sidesheet>
  );
}

type EditRowProps = {
  edit: UnsavedEdit;
  whoName: string | null;
  /** Undefined while the preview loads. */
  isAffecting: boolean | undefined;
  onShowInGrid?: (edit: UnsavedEdit) => void;
};

function EditRow({ edit, whoName, isAffecting, onShowInGrid }: EditRowProps) {
  return (
    <Stack gap="xs" aria-label={`${edit.label} · ${edit.permission}`}>
      <Text>{`${edit.label} · ${edit.permission}`}</Text>
      <Text>
        <Text component="s" c="text-secondary">
          {edit.before}
        </Text>
        {" → "}
        <strong>{edit.after}</strong>
      </Text>
      <Flex align="center" justify="space-between" gap="sm">
        {whoName != null && isAffecting != null && (
          <Badge variant="light" color={isAffecting ? "brand" : "neutral"}>
            {isAffecting
              ? t`Affects ${whoName}`
              : t`${whoName} isn't in this group`}
          </Badge>
        )}
        {onShowInGrid && (
          <Anchor component="button" onClick={() => onShowInGrid(edit)}>
            {t`Show in grid`}
          </Anchor>
        )}
      </Flex>
    </Stack>
  );
}
