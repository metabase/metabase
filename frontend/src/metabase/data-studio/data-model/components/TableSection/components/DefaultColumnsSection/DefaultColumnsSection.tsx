import { useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FIELD_VISIBILITY_TYPES } from "metabase/common/utils/fields";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  Field,
  FieldId,
  FieldVisibilityType,
  Table,
} from "metabase-types/api";

const TOGGLEABLE_VISIBILITIES = new Set<FieldVisibilityType>([
  "normal",
  "hidden-by-default",
]);

const VISIBILITY_LABEL_BY_ID: Record<FieldVisibilityType, string> =
  Object.fromEntries(
    FIELD_VISIBILITY_TYPES.map((type) => [type.id, type.name]),
  ) as Record<FieldVisibilityType, string>;

interface Props {
  table: Table;
}

export function DefaultColumnsSection({ table }: Props) {
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [pendingIds, setPendingIds] = useState<Set<FieldId>>(new Set());
  const [isBulking, setIsBulking] = useState(false);

  const fields = useMemo(() => table.fields ?? [], [table.fields]);
  const { toggleableFields, shownCount } = useMemo(() => {
    const toggleable = fields.filter((f) =>
      TOGGLEABLE_VISIBILITIES.has(f.visibility_type),
    );
    return {
      toggleableFields: toggleable,
      shownCount: toggleable.filter((f) => f.visibility_type === "normal")
        .length,
    };
  }, [fields]);

  const runUpdates = useCallback(
    async (
      updates: { field: Field; next: FieldVisibilityType }[],
    ): Promise<{ ok: Field[]; failed: Field[] }> => {
      const ok: Field[] = [];
      const failed: Field[] = [];
      const results = await Promise.all(
        updates.map(async ({ field, next }) => {
          const { error } = await updateField({
            id: getRawTableFieldId(field),
            visibility_type: next,
          });
          return { field, error };
        }),
      );
      for (const { field, error } of results) {
        if (error) {
          failed.push(field);
        } else {
          ok.push(field);
        }
      }
      return { ok, failed };
    },
    [updateField],
  );

  const revert = useCallback(
    async (snapshot: { field: Field; prev: FieldVisibilityType }[]) => {
      const { failed } = await runUpdates(
        snapshot.map(({ field, prev }) => ({ field, next: prev })),
      );
      sendUndoToast(failed.length > 0 ? new Error("undo failed") : null);
    },
    [runUpdates, sendUndoToast],
  );

  const handleToggle = useCallback(
    async (field: Field, show: boolean): Promise<void> => {
      const fieldId = getRawTableFieldId(field);
      if (pendingIds.has(fieldId)) {
        return;
      }
      const prev = field.visibility_type;
      const next: FieldVisibilityType = show ? "normal" : "hidden-by-default";
      setPendingIds((s) => new Set(s).add(fieldId));
      const { failed } = await runUpdates([{ field, next }]);
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(fieldId);
        return n;
      });
      if (failed.length > 0) {
        sendErrorToast(t`Failed to update ${field.display_name}`);
        return;
      }
      sendSuccessToast(
        show
          ? t`${field.display_name} shown by default`
          : t`${field.display_name} hidden by default`,
        () => revert([{ field, prev }]),
      );
    },
    [pendingIds, runUpdates, sendErrorToast, sendSuccessToast, revert],
  );

  const handleBulk = useCallback(
    async (show: boolean) => {
      if (isBulking) {
        return;
      }
      const next: FieldVisibilityType = show ? "normal" : "hidden-by-default";
      const targets = toggleableFields.filter(
        (f) => f.visibility_type !== next,
      );
      if (targets.length === 0) {
        return;
      }
      const snapshot = targets.map((field) => ({
        field,
        prev: field.visibility_type,
      }));
      setIsBulking(true);
      const { ok, failed } = await runUpdates(
        targets.map((field) => ({ field, next })),
      );
      setIsBulking(false);
      if (failed.length > 0) {
        sendErrorToast(
          ngettext(
            msgid`Failed to update ${failed.length} of ${targets.length} column`,
            `Failed to update ${failed.length} of ${targets.length} columns`,
            targets.length,
          ),
        );
      }
      if (ok.length > 0) {
        sendSuccessToast(
          show
            ? ngettext(
                msgid`${ok.length} column now shown by default`,
                `${ok.length} columns now shown by default`,
                ok.length,
              )
            : ngettext(
                msgid`${ok.length} column now hidden by default`,
                `${ok.length} columns now hidden by default`,
                ok.length,
              ),
          () =>
            revert(snapshot.filter((s) => ok.some((f) => f.id === s.field.id))),
        );
      }
    },
    [
      isBulking,
      toggleableFields,
      runUpdates,
      sendErrorToast,
      sendSuccessToast,
      revert,
    ],
  );

  if (fields.length === 0) {
    return null;
  }

  return (
    <Card
      withBorder
      p="md"
      data-testid="default-columns-section"
      aria-label={t`Default visible columns`}
    >
      <Stack gap="sm">
        <Flex align="center" justify="space-between" gap="md">
          <Title order={4} fz="sm">
            {t`Default visible columns`}
          </Title>
          <Text c="text-tertiary" size="sm">
            {ngettext(
              msgid`${shownCount} of ${toggleableFields.length} shown`,
              `${shownCount} of ${toggleableFields.length} shown`,
              toggleableFields.length,
            )}
          </Text>
        </Flex>

        <Text c="text-secondary" size="sm">
          {t`Pick which columns are shown when anyone opens this table. Users can still add hidden columns via the column picker.`}
        </Text>

        <Group gap="sm">
          <Button
            size="xs"
            variant="subtle"
            loading={isBulking}
            disabled={isBulking || toggleableFields.length === 0}
            onClick={() => handleBulk(true)}
          >
            {t`Show all`}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            loading={isBulking}
            disabled={isBulking || toggleableFields.length === 0}
            onClick={() => handleBulk(false)}
          >
            {t`Hide all`}
          </Button>
        </Group>

        <Stack gap="xs">
          {fields.map((field) => (
            <FieldRow
              key={getRawTableFieldId(field)}
              field={field}
              pending={pendingIds.has(getRawTableFieldId(field))}
              disabledByBulk={isBulking}
              onToggle={handleToggle}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

interface FieldRowProps {
  field: Field;
  pending: boolean;
  disabledByBulk: boolean;
  onToggle: (field: Field, show: boolean) => Promise<void>;
}

function FieldRow({ field, pending, disabledByBulk, onToggle }: FieldRowProps) {
  const icon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
  const toggleable = TOGGLEABLE_VISIBILITIES.has(field.visibility_type);
  const checked = field.visibility_type === "normal";
  const label = (
    <Group gap="xs" align="center">
      <Icon name={icon} />
      <Text>{field.display_name}</Text>
    </Group>
  );

  if (!toggleable) {
    const humanName =
      VISIBILITY_LABEL_BY_ID[field.visibility_type] ?? field.visibility_type;
    return (
      <Tooltip
        label={t`Controlled by this field's Visibility setting (${humanName}).`}
        position="top-start"
        events={{ hover: true, focus: true, touch: false }}
      >
        <Box tabIndex={0} role="group">
          <Checkbox
            checked={false}
            disabled
            label={label}
            aria-label={t`Show ${field.display_name} by default`}
          />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Checkbox
      checked={checked}
      disabled={pending || disabledByBulk}
      label={label}
      aria-label={t`Show ${field.display_name} by default`}
      onChange={(e) => onToggle(field, e.currentTarget.checked)}
    />
  );
}
