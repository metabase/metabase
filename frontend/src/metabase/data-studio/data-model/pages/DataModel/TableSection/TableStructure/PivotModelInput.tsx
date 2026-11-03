import { useDisclosure } from "@mantine/hooks";
import { msgid, ngettext, t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
} from "metabase/common/components/DetailSidebar";
import { dayjs } from "metabase/dayjs";
import {
  type ResolvedEavBinding,
  usePivotModel,
  usePropertyRegistry,
} from "metabase/metadata/table-structure";
import { Button, Group, Icon, Loader, Modal, Stack, Text } from "metabase/ui";
import type { IconName, Table } from "metabase-types/api";

import {
  getPropertyIcon,
  getPropertyTypeDescription,
} from "../../PropertyDetailsPanel/property-labels";

type PivotModelInputProps = {
  table: Table;
  resolved: ResolvedEavBinding;
  disabled: boolean;
};

export function PivotModelInput({
  table,
  resolved,
  disabled,
}: PivotModelInputProps) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const state = usePropertyRegistry(table);
  const { pivotModel, savePivotModel } = usePivotModel(table);
  const entityTable = resolved.entityTable;

  if (state.status === "loading") {
    return <Loader size="xs" />;
  }
  if (state.status !== "loaded" || !entityTable) {
    return (
      <Text c="text-secondary">
        {t`Bind the entity, property and value columns first`}
      </Text>
    );
  }

  const columns = state.registry.properties.filter(
    (property) => !property.isHidden,
  );
  const hiddenCount = state.registry.properties.length - columns.length;
  const modelName = t`${entityTable.display_name} with custom fields`;
  const createModel = () => {
    savePivotModel({
      name: modelName,
      columnCount: columns.length + 1,
      generatedAt: new Date().toISOString(),
    });
    close();
  };

  return (
    <Stack gap="xs" py="xs">
      {pivotModel ? (
        <Stack gap={0}>
          <Group gap="xs">
            <Icon name="model" c="text-brand" />
            <Text fw="bold">{pivotModel.name}</Text>
          </Group>
          <Text size="sm" c="text-secondary">
            {t`${pivotModel.columnCount} columns · generated ${dayjs(pivotModel.generatedAt).format("MMM D, YYYY")}`}
          </Text>
        </Stack>
      ) : (
        <Text size="sm" c="text-secondary">
          {t`A model with one row per ${getRowNoun(entityTable)} and a column for each custom field.`}
        </Text>
      )}
      <Button
        size="compact-sm"
        variant={pivotModel ? "subtle" : "default"}
        w="fit-content"
        px={pivotModel ? 0 : undefined}
        leftSection={<Icon name={pivotModel ? "refresh" : "model"} />}
        disabled={disabled}
        onClick={open}
      >
        {pivotModel ? t`Refresh pivot model` : t`Generate pivot model`}
      </Button>
      <Modal
        opened={isOpen}
        title={t`One row per ${getRowNoun(entityTable)} with custom fields`}
        size="lg"
        onClose={close}
      >
        <Stack gap="lg">
          <Text>
            {resolved.definitionTable
              ? t`Creates the model “${modelName}”, with a column for each field in ${resolved.definitionTable.name}. Columns are labelled and typed from its definitions.`
              : t`Creates the model “${modelName}”, with a column for each property. There's no definitions table, so labels and types are inferred from the values.`}
          </Text>
          <DetailsTable>
            <PivotColumn
              icon="label"
              name={resolved.entityKeyField?.display_name ?? t`Entity`}
              description={t`Links to ${entityTable.display_name}`}
            />
            {columns.map((property) => (
              <PivotColumn
                key={property.key}
                icon={getPropertyIcon(property)}
                name={property.displayName}
                description={getPropertyTypeDescription(property)}
              />
            ))}
          </DetailsTable>
          {hiddenCount > 0 && (
            <Text size="sm" c="text-secondary">
              {ngettext(
                msgid`${hiddenCount} hidden field is left out.`,
                `${hiddenCount} hidden fields are left out.`,
                hiddenCount,
              )}
            </Text>
          )}
          {pivotModel && (
            <Text size="sm" c="text-secondary">
              {t`Refreshing updates “${pivotModel.name}” in place. Columns an admin edited in the model keep their edits.`}
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button onClick={close}>{t`Cancel`}</Button>
            <Button variant="filled" onClick={createModel}>
              {pivotModel ? t`Refresh model` : t`Create model`}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function PivotColumn({
  icon,
  name,
  description,
}: {
  icon: IconName;
  name: string;
  description: string;
}) {
  return (
    <DetailsRow
      label={name}
      value={
        <Group gap="sm" wrap="nowrap">
          <Icon name={icon} c="text-secondary" />
          <Text c="text-primary">{description}</Text>
        </Group>
      }
    />
  );
}

const getRowNoun = (table: Table) =>
  table.display_name.toLowerCase().replace(/s$/, "");
