import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Button, Center, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackQueryAction } from "metabase-types/api";

import { ActionHeader } from "../../components/ActionHeader";
import { useActionFields } from "../../hooks/use-action-fields";
import { useActionPermissions } from "../../hooks/use-action-permissions";
import { useRouteAction } from "../../hooks/use-route-action";

import { ActionFieldDetails } from "./ActionFieldDetails";
import { ActionFieldList } from "./ActionFieldList";
import S from "./ActionFieldsPage.module.css";

export function ActionFieldsPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    readOnly,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionPermissions(action);
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ActionFieldsPageBody action={action} readOnly={readOnly} />;
}

type ActionFieldsPageBodyProps = {
  action: WritebackQueryAction;
  readOnly: boolean;
};

function ActionFieldsPageBody({ action, readOnly }: ActionFieldsPageBodyProps) {
  const { fieldId } = useParams<{ fieldId?: string }>();
  const { fields, updateField, reorderFields } = useActionFields(action);
  const field = fields.find((field) => field.parameter.id === fieldId);

  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} readOnly={readOnly} px="3.5rem" />
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
            actionId={action.id}
            fields={fields}
            activeFieldId={field?.parameter.id}
            readOnly={readOnly}
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
                to={Urls.dataActionFields(action.id)}
                aria-label={t`Close`}
                leftSection={<Icon name="close" />}
              />
            </Group>
            <ActionFieldDetails
              key={field.parameter.id}
              field={field}
              readOnly={readOnly}
              onChange={(patch) => updateField(field.parameter.id, patch)}
            />
          </Stack>
        )}
      </Flex>
    </PageContainer>
  );
}
