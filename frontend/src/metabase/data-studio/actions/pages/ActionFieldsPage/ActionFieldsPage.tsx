import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import {
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Skeleton,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackQueryAction } from "metabase-types/api";

import { ActionHeader } from "../../components/ActionHeader";
import { ActionPageSkeleton } from "../../components/ActionPageSkeleton";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useRouteAction } from "../../hooks/use-route-action";
import { canEditActionQuery } from "../../utils";

import { ActionFieldDetails } from "./ActionFieldDetails";
import { ActionFieldList } from "./ActionFieldList";
import S from "./ActionFieldsPage.module.css";
import { useActionFields } from "./hooks";

const FIELD_SKELETON_COUNT = 3;

export function ActionFieldsPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading) {
    return <ActionFieldsPageSkeleton />;
  }

  if (error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <ActionFieldsPageBody
      action={action}
      canChangeFieldType={canEditActionQuery(action, databases)}
    />
  );
}

type ActionFieldsPageBodyProps = {
  action: WritebackQueryAction;
  canChangeFieldType: boolean;
};

function ActionFieldsPageBody({
  action,
  canChangeFieldType,
}: ActionFieldsPageBodyProps) {
  const readOnly = !action.can_write;
  const { fieldId } = useParams<{ fieldId?: string }>();
  const { fields, updateField, reorderFields } = useActionFields(action);
  const field = fields.find((field) => field.parameter.id === fieldId);

  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
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
                to={Urls.dataStudioActionFields(action.id)}
                aria-label={t`Close`}
                leftSection={<Icon name="close" />}
              />
            </Group>
            <ActionFieldDetails
              key={field.parameter.id}
              field={field}
              readOnly={readOnly}
              canChangeFieldType={canChangeFieldType}
              onChange={(patch) => updateField(field.parameter.id, patch)}
            />
          </Stack>
        )}
      </Flex>
    </PageContainer>
  );
}

function ActionFieldsPageSkeleton() {
  return (
    <ActionPageSkeleton gap="lg" px={0} pb={0} headerPx="3.5rem">
      <Flex className={S.body} flex={1} mih={0}>
        <Stack
          className={S.column}
          flex="8 1 0"
          miw={320}
          maw={640}
          mih={0}
          pl="3.5rem"
          pr="xl"
          py="xl"
          gap="lg"
        >
          <Stack gap="xs">
            <Title order={4}>{t`Fields`}</Title>
            <Skeleton h={12} w="80%" my={4} radius="xs" />
          </Stack>
          <Stack gap="md">
            {Array.from({ length: FIELD_SKELETON_COUNT }, (_, index) => (
              <Skeleton key={index} h={70} radius="md" />
            ))}
          </Stack>
        </Stack>
      </Flex>
    </ActionPageSkeleton>
  );
}
