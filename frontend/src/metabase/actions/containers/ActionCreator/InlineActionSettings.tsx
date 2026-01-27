import { useDisclosure } from "@mantine/hooks";
import type { ChangeEvent, ChangeEventHandler } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { CopyWidget } from "metabase/common/components/CopyWidget";
import { FormField } from "metabase/common/components/FormField";
import { TextArea } from "metabase/common/components/TextArea";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Actions } from "metabase/entities/actions/actions";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Switch, Tooltip } from "metabase/ui";
import type {
  ActionFormSettings,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { isActionPublic, isSavedAction } from "../../utils";

import {
  ActionSettingsContent,
  CopyWidgetContainer,
} from "./InlineActionSettings.styled";

interface OwnProps {
  action?: Partial<WritebackAction>;
  formSettings: ActionFormSettings;
  isEditable: boolean;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClose?: () => void;
  onBack?: () => void;
}

interface StateProps {
  siteUrl: string;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
}

interface DispatchProps {
  onCreatePublicLink: ({ id }: { id: WritebackActionId }) => void;
  onDeletePublicLink: ({ id }: { id: WritebackActionId }) => void;
}

type ActionSettingsInlineProps = OwnProps & StateProps & DispatchProps;

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

const mapStateToProps = (state: State): StateProps => ({
  siteUrl: getSetting(state, "site-url"),
  isAdmin: getUserIsAdmin(state),
  isPublicSharingEnabled: getSetting(state, "enable-public-sharing"),
});

const mapDispatchToProps: DispatchProps = {
  onCreatePublicLink: Actions.actions.createPublicLink,
  onDeletePublicLink: Actions.actions.deletePublicLink,
};

const InlineActionSettings = ({
  action,
  formSettings,
  isEditable,
  siteUrl,
  isAdmin,
  isPublicSharingEnabled,
  onChangeFormSettings,
  onCreatePublicLink,
  onDeletePublicLink,
  onClose,
  onBack,
}: ActionSettingsInlineProps) => {
  const id = useUniqueId();
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const hasSharingPermission = isAdmin && isPublicSharingEnabled;

  const handleTogglePublic: ChangeEventHandler<HTMLInputElement> = (event) => {
    const isPublic = event.target.checked;

    if (isPublic) {
      if (isSavedAction(action)) {
        onCreatePublicLink({ id: action.id });
      }
    } else {
      openModal();
    }
  };

  const handleDisablePublicLink = () => {
    if (isSavedAction(action)) {
      onDeletePublicLink({ id: action.id });
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
export default connect<StateProps, DispatchProps, OwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(InlineActionSettings);
