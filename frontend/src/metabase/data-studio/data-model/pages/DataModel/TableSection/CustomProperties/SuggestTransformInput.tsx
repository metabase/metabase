import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import {
  type PropertyRegistry,
  type ResolvedEavBinding,
  usePropertyRegistry,
} from "metabase/metadata/table-structure";
import { useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  getEntityNoun,
  getMissingBindingMessage,
} from "../../PropertyDetailsPanel/property-labels";

import {
  getBindingColumns,
  getBoundEntity,
  toTableRef,
} from "./binding-columns";
import {
  getPivotTransformColumns,
  getPivotTransformSql,
} from "./pivot-transform-sql";
import {
  SUGGESTED_TRANSFORM_CARD_ID,
  saveSuggestedTransform,
} from "./suggested-transform";

type SuggestTransformInputProps = {
  table: Table;
  resolved: ResolvedEavBinding;
  disabled: boolean;
};

export function SuggestTransformInput({
  table,
  resolved,
  disabled,
}: SuggestTransformInputProps) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const state = usePropertyRegistry(table);

  if (state.status === "loading") {
    return <Loader size="xs" />;
  }
  if (state.status !== "loaded") {
    return <Text c="text-secondary">{getMissingBindingMessage()}</Text>;
  }

  return (
    <Stack gap="xs" py="xs">
      <Text size="sm" c="text-secondary">
        {t`Pivot these properties into a table with one column per property.`}
      </Text>
      <Button
        size="compact-sm"
        variant="default"
        w="fit-content"
        leftSection={<Icon name="sparkles" />}
        disabled={disabled}
        onClick={open}
      >
        {t`Suggest a transform`}
      </Button>
      {isOpen && (
        <SuggestedTransformModal
          table={table}
          resolved={resolved}
          registry={state.registry}
          onClose={close}
        />
      )}
    </Stack>
  );
}

function getSuggestedSql(
  table: Table,
  resolved: ResolvedEavBinding,
  registry: PropertyRegistry,
) {
  const bindingColumns = getBindingColumns(table, resolved);
  if (bindingColumns == null) {
    return null;
  }
  const columns = getPivotTransformColumns(registry);
  const sql = getPivotTransformSql({
    table: toTableRef(table),
    bindingColumns,
    entity: getBoundEntity(resolved),
    columns,
  });
  return { sql, columnCount: columns.length };
}

function SuggestedTransformModal({
  table,
  resolved,
  registry,
  onClose,
}: {
  table: Table;
  resolved: ResolvedEavBinding;
  registry: PropertyRegistry;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const noun = getEntityNoun(resolved.entityTable);
  const suggestion = getSuggestedSql(table, resolved, registry);
  const name = t`${resolved.entityTable?.display_name ?? table.display_name} with custom properties`;

  const createTransform = () => {
    if (suggestion == null) {
      return;
    }
    saveSuggestedTransform({
      name,
      databaseId: table.db_id,
      sql: suggestion.sql,
    });
    navigate(Urls.newTransformFromCard(SUGGESTED_TRANSFORM_CARD_ID));
  };

  return (
    <Modal opened size="xl" title={t`Suggested transform`} onClose={onClose}>
      <Stack gap="lg">
        {suggestion == null ? (
          <Text c="text-secondary">{getMissingBindingMessage()}</Text>
        ) : (
          <>
            <Text>
              {ngettext(
                msgid`One row per ${noun.singular}, with ${suggestion.columnCount} property column typed from the registry.`,
                `One row per ${noun.singular}, with ${suggestion.columnCount} property columns typed from the registry.`,
                suggestion.columnCount,
              )}
            </Text>
            <Text size="sm" c="text-secondary">
              {t`Hidden properties are left out, and merged ones count toward the property they're merged into. Values that don't fit a property's type become empty; the generated checks report them.`}
            </Text>
            <Box
              mah="50vh"
              bd="1px solid var(--mb-color-border-neutral)"
              bdrs="md"
              style={{ overflow: "auto" }}
            >
              <CodeEditor value={suggestion.sql} language="sql" readOnly />
            </Box>
          </>
        )}
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            disabled={suggestion == null}
            onClick={createTransform}
          >
            {t`Create transform`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
