import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import {
  useCreateActionPublicLinkMutation,
  useDeleteActionPublicLinkMutation,
  useUpdateActionMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useMetadataToasts } from "metabase/common/hooks";
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
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackQueryAction } from "metabase-types/api";

import { ActionHeader } from "../../components/ActionHeader";
import { useActionPermissions } from "../../hooks/use-action-permissions";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionSettingsPage() {
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
  const isAdmin = useSelector(getUserIsAdmin);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-settings">
      <ActionHeader action={action} readOnly={readOnly} />
      <Stack gap="2.5rem">
        {isAdmin && isPublicSharingEnabled && (
          <PublicSharingSection action={action} />
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

function PublicSharingSection({ action }: SectionProps) {
  const siteUrl = useSetting("site-url");
  const [createPublicLink] = useCreateActionPublicLinkMutation();
  const [deletePublicLink] = useDeleteActionPublicLinkMutation();
  const [isConfirmOpened, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();
  const { sendErrorToast } = useMetadataToasts();
  const isPublic = action.public_uuid != null;

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      openConfirm();
      return;
    }
    const { error } = await createPublicLink({ id: action.id });
    if (error) {
      sendErrorToast(t`Failed to create a public link`);
    }
  };

  const handleDisable = async () => {
    const { error } = await deletePublicLink({ id: action.id });
    closeConfirm();
    if (error) {
      sendErrorToast(t`Failed to disable the public link`);
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
        <Switch
          aria-label={t`Make public`}
          checked={isPublic}
          onChange={(event) => handleToggle(event.currentTarget.checked)}
        />
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
      <ConfirmModal
        opened={isConfirmOpened}
        title={t`Disable this public link?`}
        content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
        onConfirm={handleDisable}
        onClose={closeConfirm}
      />
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
