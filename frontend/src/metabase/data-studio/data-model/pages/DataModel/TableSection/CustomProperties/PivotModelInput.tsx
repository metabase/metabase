import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { dayjs } from "metabase/dayjs";
import {
  type PropertyRegistry,
  type RegistryProperty,
  type ResolvedEavBinding,
  usePivotModel,
  usePropertyRegistry,
  usePropertySampleRows,
} from "metabase/metadata/table-structure";
import {
  Button,
  Chip,
  Group,
  Icon,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  getEntityNoun,
  getMissingBindingMessage,
} from "../../PropertyDetailsPanel/property-labels";

import S from "./PivotModelInput.module.css";
import { formatPropertyValue, pivotSampleRows } from "./pivot-preview";

const PREVIEW_ROW_COUNT = 4;

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
  const { pivotModel } = usePivotModel(table);
  const entityTable = resolved.entityTable;

  if (state.status === "loading") {
    return <Loader size="xs" />;
  }
  if (state.status !== "loaded" || !entityTable) {
    return <Text c="text-secondary">{getMissingBindingMessage()}</Text>;
  }

  const noun = getEntityNoun(entityTable);

  return (
    <Stack gap="xs" py="xs">
      {pivotModel ? (
        <Stack gap={0}>
          <Group gap="xs">
            <Icon name="model" c="text-brand" />
            <Text fw="bold">{pivotModel.name}</Text>
          </Group>
          <Text size="sm" c="text-secondary">
            {t`${pivotModel.propertyKeys.length + 1} columns · generated ${dayjs(pivotModel.generatedAt).format("MMM D, YYYY")}`}
          </Text>
        </Stack>
      ) : (
        <Text size="sm" c="text-secondary">
          {t`Save the properties as a model with one row per ${noun.singular}.`}
        </Text>
      )}
      <Group gap="md">
        {pivotModel && (
          <Button
            component={Link}
            to={Urls.model({
              id: pivotModel.id,
              name: pivotModel.name,
              type: "model",
            })}
            size="compact-sm"
            variant="subtle"
            px={0}
            leftSection={<Icon name="model" />}
          >
            {t`Open model`}
          </Button>
        )}
        <Button
          size="compact-sm"
          variant={pivotModel ? "subtle" : "default"}
          px={pivotModel ? 0 : undefined}
          leftSection={<Icon name={pivotModel ? "refresh" : "add"} />}
          disabled={disabled}
          onClick={open}
        >
          {pivotModel ? t`Refresh model` : t`Create pivot model`}
        </Button>
      </Group>
      {isOpen && (
        <PivotModelModal
          table={table}
          entityTable={entityTable}
          registry={state.registry}
          onClose={close}
        />
      )}
    </Stack>
  );
}

function PivotModelModal({
  table,
  entityTable,
  registry,
  onClose,
}: {
  table: Table;
  entityTable: Table;
  registry: PropertyRegistry;
  onClose: () => void;
}) {
  const { pivotModel, savePivotModel } = usePivotModel(table);
  const candidates = registry.properties.filter(
    (property) => property.mergedInto == null && property.rowCount > 0,
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    () =>
      pivotModel?.propertyKeys ??
      candidates
        .filter((property) => property.isSuggestedForPivot)
        .map(({ key }) => key),
  );
  const noun = getEntityNoun(entityTable);
  const modelName = t`${entityTable.display_name} with custom properties`;
  const selected = candidates.filter(({ key }) => selectedKeys.includes(key));
  const skippedCount = candidates.length - selected.length;

  const createModel = () => {
    savePivotModel({
      name: modelName,
      tableId: Number(table.id),
      propertyKeys: selectedKeys,
      generatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal
      opened
      title={t`One row per ${noun.singular} with custom properties`}
      size="xl"
      onClose={onClose}
    >
      <Stack gap="lg">
        <Stack gap="sm">
          <Text fw="bold">{t`Properties`}</Text>
          <Chip.Group multiple value={selectedKeys} onChange={setSelectedKeys}>
            <Group gap="xs">
              {candidates.map((property) => (
                <Chip key={property.key} value={property.key} size="sm">
                  {property.displayName}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Text size="sm" c="text-secondary">
            {skippedCount > 0
              ? ngettext(
                  msgid`${skippedCount} property is left out: low coverage, no definition, or a likely duplicate. Click it to add it.`,
                  `${skippedCount} properties are left out: low coverage, no definition, or a likely duplicate. Click one to add it.`,
                  skippedCount,
                )
              : t`Every property with values is included.`}
          </Text>
        </Stack>
        <Stack gap="sm">
          <Text fw="bold">{t`Preview`}</Text>
          <PivotPreview
            table={table}
            entityKeyName={t`${noun.title} ID`}
            properties={selected}
            registry={registry}
          />
        </Stack>
        <Group justify="space-between">
          <Text size="sm" c="text-secondary">
            {pivotModel
              ? t`Updates “${pivotModel.name}” in place.`
              : t`Saved as the model “${modelName}”.`}
          </Text>
          <Group gap="sm">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              disabled={selected.length === 0}
              onClick={createModel}
            >
              {pivotModel ? t`Refresh model` : t`Create model`}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

export function PivotPreview({
  table,
  entityKeyName,
  properties,
  registry,
  rowCount = PREVIEW_ROW_COUNT,
}: {
  table: Table;
  entityKeyName: string;
  properties: RegistryProperty[];
  registry: PropertyRegistry;
  rowCount?: number;
}) {
  const samples = usePropertySampleRows(table);
  if (!samples) {
    return <Loader size="xs" />;
  }
  const entities = pivotSampleRows(samples, registry.properties).slice(
    0,
    rowCount,
  );
  return (
    <ScrollArea>
      <table className={S.preview}>
        <thead>
          <tr>
            <th>{entityKeyName}</th>
            {properties.map((property) => (
              <th key={property.key}>{property.displayName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={String(entity.entityKey)}>
              <td>{String(entity.entityKey)}</td>
              {properties.map((property) => (
                <td key={property.key}>
                  <PreviewCell
                    property={property}
                    value={entity.valuesByProperty.get(property.key)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function PreviewCell({
  property,
  value,
}: {
  property: RegistryProperty;
  value: string | undefined;
}) {
  const formatted = formatPropertyValue(property, value);
  if (formatted != null) {
    return <>{formatted}</>;
  }
  if (value == null || value === "") {
    return (
      <Text span c="text-secondary-opaque">
        —
      </Text>
    );
  }
  return (
    <Text span c="text-secondary-opaque" td="line-through">
      {value}
    </Text>
  );
}
