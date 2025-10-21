import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/common/components/EmptyState";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ResponsiveButton } from "metabase/metadata/pages/DataModel/components";
import S from "metabase/metadata/pages/DataModel/components/TableSection/TableSection.module.css";
import { useResponsiveButtons } from "metabase/metadata/pages/DataModel/components/TableSection/hooks";
import { ModelSortableFieldList } from "metabase/metadata/pages/DataModel/components/models/ModelSortableFieldList";
import { getModelFieldMetadataUrl } from "metabase/metadata/pages/DataModel/components/models/utils";
import type { FieldChangeParams } from "metabase/metadata/pages/DataModel/types";
import { Group, Loader, Stack, Text, rem } from "metabase/ui";
import { getSortedModelFields } from "metabase-lib/v1/metadata/utils/models"; // eslint-disable-line no-restricted-imports
import type { Card, CollectionId, FieldName } from "metabase-types/api";

import { FieldItem } from "./FieldItem";
import type { ModelColumnUpdate } from "./types";

interface Props {
  activeFieldName?: FieldName;
  getFieldHref: (fieldName: FieldName) => string;
  model: Card;
  onChangeSettings: (update: ModelColumnUpdate) => Promise<{ error?: unknown }>;
}

export const ModelColumnsList = ({
  activeFieldName,
  getFieldHref,
  model,
  onChangeSettings,
}: Props) => {
  const fields = useMemo(() => {
    return getSortedModelFields(
      model.result_metadata,
      model.visualization_settings,
    );
  }, [model.result_metadata, model.visualization_settings]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const name = field.name;
        const parentName = field.nfc_path?.[0] ?? "";
        const parent = fieldsByName[parentName];

        return (
          <FieldItem
            key={name}
            active={name === activeFieldName}
            field={field}
            parent={parent}
            href={getFieldHref(name)}
            onChangeSettings={onChangeSettings}
          />
        );
      })}
    </Stack>
  );
};

interface ModelColumnsSectionProps {
  collectionId: CollectionId;
  modelId: number;
  fieldName: FieldName | undefined;
  model: Card;
  onFieldChange: (update: FieldChangeParams) => Promise<{ error?: unknown }>;
  onFieldsOrderChange: (
    fieldsOrder: FieldName[],
  ) => Promise<{ error?: unknown }>;
}

export function ModelColumnsSection({
  collectionId,
  modelId,
  fieldName,
  model,
  onFieldChange,
  onFieldsOrderChange,
}: ModelColumnsSectionProps) {
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [isSorting, setIsSorting] = useState(false);
  const isUpdatingSorting = false;

  const hasFields = Boolean(
    model.result_metadata && model.result_metadata.length > 0,
  );

  const {
    buttonsContainerRef,
    showButtonLabel,
    setDoneButtonWidth,
    setSortingButtonWidth,
  } = useResponsiveButtons({
    hasFields,
    isSorting,
    isUpdatingSorting,
  });

  const handleCustomFieldOrderChange = async (fieldOrder: FieldName[]) => {
    const { error } = await onFieldsOrderChange(fieldOrder);

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        const { error } = await onFieldsOrderChange(fieldOrder);
        sendUndoToast(error);
      });
    }
  };

  return (
    <Stack data-testid="table-section" gap={0} pb="xl">
      <Stack
        bg="accent-gray-light"
        className={S.header}
        gap="lg"
        pb={12}
        pos="sticky"
        pt="xl"
        px="xl"
        top={0}
      >
        <Group
          align="center"
          gap="md"
          justify="space-between"
          miw={0}
          wrap="nowrap"
        >
          <Text flex="0 0 auto" fw="bold">{t`Fields`}</Text>

          <Group
            flex="1"
            gap="md"
            justify="flex-end"
            miw={0}
            ref={buttonsContainerRef}
            wrap="nowrap"
          >
            {/* keep these conditions in sync with getRequiredWidth in useResponsiveButtons */}

            {isUpdatingSorting && (
              <Loader data-testid="loading-indicator" size="xs" />
            )}

            {!isSorting && hasFields && (
              <ResponsiveButton
                icon="sort_arrows"
                showLabel={showButtonLabel}
                onClick={() => setIsSorting(true)}
                onRequestWidth={setSortingButtonWidth}
              >{t`Sorting`}</ResponsiveButton>
            )}

            {isSorting && (
              <ResponsiveButton
                icon="check"
                showLabel={showButtonLabel}
                showIconWithLabel={false}
                onClick={() => setIsSorting(false)}
                onRequestWidth={setDoneButtonWidth}
              >{t`Done`}</ResponsiveButton>
            )}
          </Group>
        </Group>
      </Stack>

      <Stack gap="lg" px="xl">
        <Stack gap={12}>
          {!hasFields && <EmptyState message={t`This model has no columns`} />}

          {isSorting && hasFields && (
            <ModelSortableFieldList
              activeFieldName={fieldName}
              model={model}
              onChange={handleCustomFieldOrderChange}
            />
          )}

          {!isSorting && hasFields && (
            <ModelColumnsList
              activeFieldName={fieldName}
              getFieldHref={(fieldName) =>
                getModelFieldMetadataUrl({ collectionId, modelId, fieldName })
              }
              model={model}
              onChangeSettings={onFieldChange}
            />
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
