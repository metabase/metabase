import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent, ChangeEventHandler } from "react";
import { t } from "ttag";

import {
  useCreateActionPublicLinkMutation,
  useDeleteActionPublicLinkMutation,
} from "metabase/api";
import { Button } from "metabase/common/components/Button";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { CopyWidget } from "metabase/common/components/CopyWidget";
import { FormField } from "metabase/common/components/FormField";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { TextArea } from "metabase/common/components/TextArea";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Switch, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ActionFormSettings, WritebackAction } from "metabase-types/api";

import { isActionPublic, isSavedAction } from "../../utils";

import {
  ActionSettingsContent,
  CopyWidgetContainer,
} from "./InlineActionSettings.styled";

type InlineActionSettingsProps = {
  action?: Partial<WritebackAction>;
  formSettings: ActionFormSettings;
  isEditable: boolean;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClose?: () => void;
  onBack?: () => void;
};

export const ActionSettingsTriggerButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <Tooltip label={t`Action settings`}>
    <Button
      onlyIcon
      onClick={onClick}
      icon="gear"
      iconSize={16}
      aria-label={t`Action settings`}
    />
  </Tooltip>
);

const InlineActionSettings = ({
  action,
  formSettings,
  isEditable,
  onChangeFormSettings,
  onClose,
  onBack,
}: InlineActionSettingsProps) => {
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));
  const isAdmin = useSelector((state) => getUserIsAdmin(state));
  const isPublicSharingEnabled = useSelector((state) =>
    getSetting(state, "enable-public-sharing"),
  );
  const id = useUniqueId();
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const hasSharingPermission = isAdmin && isPublicSharingEnabled;
  const [createPublicLink] = useCreateActionPublicLinkMutation();
  const [deletePublicLink] = useDeleteActionPublicLinkMutation();

  const handleTogglePublic: ChangeEventHandler<HTMLInputElement> = (event) => {
    const isPublic = event.target.checked;

    if (isPublic) {
      if (isSavedAction(action)) {
        createPublicLink({ id: action.id });
      }
    } else {
      openModal();
    }
  };

  const handleDisablePublicLink = () => {
    if (isSavedAction(action)) {
      deletePublicLink({ id: action.id });
    }
    closeModal();
  };

  const handleSuccessMessageChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    onChangeFormSettings({
      ...formSettings,
      successMessage: event.target.value,
    });
  };

  return (
    <SidebarContent
      title={t`Action settings`}
      onClose={onClose}
      onBack={onBack}
    >
      <ActionSettingsContent>
        {action && hasSharingPermission && (
          <FormField
            title={t`Make public`}
            description={t`Creates a publicly shareable link to this action form.`}
            orientation="horizontal"
            htmlFor={`${id}-public`}
          >
            <Tooltip
              disabled={isSavedAction(action)}
              label={t`To enable creating a shareable link you first need to save your action`}
            >
              <div>
                <Switch
                  id={`${id}-public`}
                  disabled={!isSavedAction(action)}
                  checked={isActionPublic(action)}
                  onChange={handleTogglePublic}
                />
              </div>
            </Tooltip>
          </FormField>
        )}
        {action?.public_uuid && hasSharingPermission && (
          <CopyWidgetContainer>
            <CopyWidget
              value={Urls.publicAction(siteUrl, action.public_uuid)}
              aria-label={t`Public action form URL`}
            />
          </CopyWidgetContainer>
        )}
        <ConfirmModal
          opened={modalOpened}
          title={t`Disable this public link?`}
          content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
          onConfirm={handleDisablePublicLink}
          onClose={closeModal}
        />
        <FormField title={t`Success message`} htmlFor={`${id}-message`}>
          <TextArea
            id={`${id}-message`}
            value={formSettings.successMessage ?? ""}
            placeholder={t`Action ran successfully`}
            fullWidth
            disabled={!isEditable}
            onChange={handleSuccessMessageChange}
          />
        </FormField>
      </ActionSettingsContent>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default InlineActionSettings;
