import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import type { FieldSettings } from "metabase-types/api";

import { ActionFieldDetails } from "./ActionFieldDetails";
import { ActionFieldEmptyState } from "./ActionFieldEmptyState";
import { ActionFieldList } from "./ActionFieldList";
import S from "./ActionFieldsContent.module.css";
import type { ActionField } from "./hooks";

type ActionFieldsContentProps = {
  fields: ActionField[];
  fieldId: string | undefined;
  description: string;
  canReorder: boolean;
  canChangeSettings: boolean;
  canChangeFieldType: boolean;
  canChangeVisibility: boolean;
  getFieldsUrl: (fieldId?: string) => string;
  onUpdateField: (fieldId: string, patch: Partial<FieldSettings>) => void;
  onReorderFields: (fieldIds: string[]) => void;
};

export function ActionFieldsContent({
  fields,
  fieldId,
  description,
  canReorder,
  canChangeSettings,
  canChangeFieldType,
  canChangeVisibility,
  getFieldsUrl,
  onUpdateField,
  onReorderFields,
}: ActionFieldsContentProps) {
  const field = fields.find((field) => field.parameter.id === fieldId);

  return (
    <Flex className={S.body} flex={1} mih={0}>
      <Stack
        className={S.column}
        flex="8 1 0"
        miw={320}
        maw={640}
        mih={0}
        pl="3.5rem"
        pr="xl"
      >
        <ActionFieldList
          fields={fields}
          activeFieldId={field?.parameter.id}
          description={description}
          isDraggable={canReorder}
          getFieldUrl={getFieldsUrl}
          onReorder={onReorderFields}
        />
      </Stack>
      {field != null && (
        <Stack
          className={S.column}
          flex="9 1 0"
          miw={320}
          maw={680}
          mih={0}
          px="xl"
          gap={0}
        >
          <Group
            className={S.header}
            justify="space-between"
            pt="xl"
            pb="lg"
            pos="sticky"
            top={0}
            bg="background_page-secondary"
          >
            <Text fw="bold">{t`Field details`}</Text>
            <Button
              variant="subtle"
              color="neutral"
              size="sm"
              component={ForwardRefLink}
              to={getFieldsUrl()}
              aria-label={t`Close`}
              leftSection={<Icon name="close" />}
            />
          </Group>
          <ActionFieldDetails
            key={field.parameter.id}
            field={field}
            canChangeSettings={canChangeSettings}
            canChangeFieldType={canChangeFieldType}
            canChangeVisibility={canChangeVisibility}
            onChange={(patch) => onUpdateField(field.parameter.id, patch)}
          />
        </Stack>
      )}
      {field == null && fields.length > 0 && (
        <Flex align="center" flex="1" justify="center" miw={240}>
          <ActionFieldEmptyState
            readOnly={!canChangeSettings && !canChangeVisibility}
          />
        </Flex>
      )}
    </Flex>
  );
}
