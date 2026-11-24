import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center, Flex, Skeleton, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  WritebackImplicitQueryAction,
  WritebackQueryAction,
} from "metabase-types/api";

import {
  ImplicitActionFieldsContent,
  QueryActionFieldsContent,
} from "../../components/ActionFieldsContent";
import S from "../../components/ActionFieldsContent/ActionFieldsContent.module.css";
import { ActionHeader } from "../../components/ActionHeader";
import { ActionPageSkeleton } from "../../components/ActionPageSkeleton";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useRouteAction } from "../../hooks/use-route-action";
import { canEditActionQuery } from "../../utils";

const FIELD_SKELETON_COUNT = 3;

export function ActionFieldsPage() {
  const { fieldId } = useParams<{ fieldId?: string }>();
  const { action, isLoading, error } = useRouteAction();

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

  return action.type === "implicit" ? (
    <ImplicitActionFieldsPage action={action} fieldId={fieldId} />
  ) : (
    <QueryActionFieldsPage action={action} fieldId={fieldId} />
  );
}

type QueryActionFieldsPageProps = {
  action: WritebackQueryAction;
  fieldId: string | undefined;
};

function QueryActionFieldsPage({
  action,
  fieldId,
}: QueryActionFieldsPageProps) {
  const { databases, isLoading, error } = useActionDatabases();

  if (isLoading) {
    return <ActionFieldsPageSkeleton />;
  }

  if (error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <QueryActionFieldsContent
        action={action}
        fieldId={fieldId}
        canChangeFieldType={canEditActionQuery(action, databases)}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioActionFields(action.id, fieldId)
        }
      />
    </PageContainer>
  );
}

type ImplicitActionFieldsPageProps = {
  action: WritebackImplicitQueryAction;
  fieldId: string | undefined;
};

function ImplicitActionFieldsPage({
  action,
  fieldId,
}: ImplicitActionFieldsPageProps) {
  return (
    <PageContainer data-testid="action-fields" gap="lg" px={0} pb={0}>
      <ActionHeader action={action} px="3.5rem" />
      <ImplicitActionFieldsContent
        action={action}
        fieldId={fieldId}
        getFieldsUrl={(fieldId) =>
          Urls.dataStudioActionFields(action.id, fieldId)
        }
      />
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
