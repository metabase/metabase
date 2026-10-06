import { useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useCreateActionPublicLinkMutation,
  useDeleteActionPublicLinkMutation,
  useGetDatabaseQuery,
  useUpdateActionMutation,
} from "metabase/api";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { hasActionsEnabled } from "metabase/common/utils/database";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import {
  Center,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackQueryAction } from "metabase-types/api";

import { ActionHeader } from "../../components/ActionHeader";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionSettingsPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const databaseId = action?.database_id;
  const {
    data: database,
    isLoading: isLoadingDatabase,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);
  const isAdmin = useSelector(getUserIsAdmin);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isLoading = isLoadingAction || isLoadingDatabase;
  const error = actionError ?? databaseError;

  if (isLoading || error != null || action == null || database == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const readOnly = !action.can_write;

  return (
    <PageContainer data-testid="action-settings">
      <ActionHeader action={action} />
      <Stack gap="2.5rem">
        {isAdmin && isPublicSharingEnabled && (
          <PublicSharingSection
            action={action}
            canMakePublic={hasActionsEnabled(database)}
          />
        )}
        <SuccessMessageSection
          key={action.id}
          action={action}
          readOnly={readOnly}
        />
      </Stack>
    </PageContainer>
  );
}

type SectionProps = {
  action: WritebackQueryAction;
  readOnly?: boolean;
};

type PublicSharingSectionProps = {
  action: WritebackQueryAction;
  canMakePublic: boolean;
};

function PublicSharingSection({
  action,
  canMakePublic,
}: PublicSharingSectionProps) {
  const siteUrl = useSetting("site-url");
  const [createPublicLink] = useCreateActionPublicLinkMutation();
  const [deletePublicLink] = useDeleteActionPublicLinkMutation();
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();
  const { sendErrorToast } = useMetadataToasts();
  const isPublic = action.public_uuid != null;

  const handleDisable = async () => {
    const { error } = await deletePublicLink({ id: action.id });
    if (error) {
      sendErrorToast(t`Failed to disable the public link`);
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      showConfirmation({
        title: t`Disable this public link?`,
        message: t`The existing link will stop working. If you make the action public again, it will get a new link.`,
        confirmButtonText: t`Disable link`,
        confirmButtonProps: { color: "negative" },
        onConfirm: handleDisable,
      });
      return;
    }
    const { error } = await createPublicLink({ id: action.id });
    if (error) {
      sendErrorToast(t`Failed to create a public link`);
    }
  };

  return (
    <TitleSection
      label={t`Public sharing`}
      description={t`Let anyone with the link run this action through a form, without signing in.`}
    >
      <Group p="xl" justify="space-between" wrap="nowrap">
        <Stack gap="xs">
          <Text fw="bold">{t`Make public`}</Text>
          <Text c="text-secondary">
            {t`Creates a publicly shareable link to this action form.`}
          </Text>
        </Stack>
        <Tooltip
          label={t`Actions are disabled for this action's database.`}
          disabled={isPublic || canMakePublic}
        >
          <Switch
            aria-label={t`Make public`}
            checked={isPublic}
            disabled={!isPublic && !canMakePublic}
            onChange={(event) => handleToggle(event.currentTarget.checked)}
          />
        </Tooltip>
      </Group>
      {action.public_uuid != null && (
        <>
          <Divider />
          <Stack p="xl" gap="sm">
            <Text fw="bold">{t`Public link`}</Text>
            <CopyTextInput
              value={Urls.publicAction(siteUrl, action.public_uuid)}
              aria-label={t`Public action form URL`}
            />
          </Stack>
        </>
      )}
      {confirmationModal}
    </TitleSection>
  );
}

function SuccessMessageSection({ action, readOnly }: SectionProps) {
  const savedMessage = action.visualization_settings?.successMessage ?? "";
  const [message, setMessage] = useState(savedMessage);
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleBlur = async () => {
    if (message === savedMessage) {
      return;
    }
    const { error } = await updateAction({
      id: action.id,
      visualization_settings: {
        ...action.visualization_settings,
        successMessage: message,
      },
    });
    if (error) {
      sendErrorToast(t`Failed to update success message`);
    } else {
      sendSuccessToast(t`Success message updated`);
    }
  };

  return (
    <TitleSection
      label={t`Success message`}
      description={t`Shown after the action runs, on dashboards and on the public form.`}
    >
      <Stack p="xl" gap="sm">
        <Textarea
          label={t`Message`}
          value={message}
          placeholder={t`Action ran successfully`}
          readOnly={readOnly}
          autosize
          minRows={3}
          onChange={(event) => setMessage(event.currentTarget.value)}
          onBlur={handleBlur}
        />
      </Stack>
    </TitleSection>
  );
}
