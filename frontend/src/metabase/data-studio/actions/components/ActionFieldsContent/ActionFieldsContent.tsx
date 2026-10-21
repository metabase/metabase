import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import type { WritebackQueryAction } from "metabase-types/api";

import { ActionFieldDetails } from "./ActionFieldDetails";
import { ActionFieldList } from "./ActionFieldList";
import S from "./ActionFieldsContent.module.css";
import { useActionFields } from "./hooks";

type ActionFieldsContentProps = {
  action: WritebackQueryAction;
  fieldId: string | undefined;
  canChangeFieldType: boolean;
  getFieldsUrl: (fieldId?: string) => string;
};

export function ActionFieldsContent({
  action,
  fieldId,
  canChangeFieldType,
  getFieldsUrl,
}: ActionFieldsContentProps) {
  const readOnly = !action.can_write;
  const { fields, updateField, reorderFields } = useActionFields(action);
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
          readOnly={readOnly}
          getFieldUrl={getFieldsUrl}
          onReorder={reorderFields}
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
            disabled={readOnly}
            canChangeFieldType={canChangeFieldType}
            onChange={(patch) => updateField(field.parameter.id, patch)}
          />
        </Stack>
      )}
    </Flex>
  );
}
