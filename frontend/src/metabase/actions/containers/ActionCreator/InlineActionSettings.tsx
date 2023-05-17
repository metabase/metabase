import React, { ChangeEvent } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";

import type {
  ActionFormSettings,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import Tooltip from "metabase/core/components/Tooltip";
import Button from "metabase/core/components/Button";
import Toggle from "metabase/core/components/Toggle";
import FormField from "metabase/core/components/FormField";
import TextArea from "metabase/core/components/TextArea";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { getUserIsAdmin } from "metabase/selectors/user";

import Actions from "metabase/entities/actions/actions";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { useToggle } from "metabase/hooks/use-toggle";
import CopyWidget from "metabase/components/CopyWidget";

import { isSavedAction } from "../../utils";
import {
  ActionSettingsContent,
  CopyWidgetContainer,
} from "./InlineActionSettings.styled";

interface OwnProps {
  action?: Partial<WritebackAction>;
  formSettings: ActionFormSettings;
  isEditable: boolean;
  onChangeFormSettings: (formSettings: ActionFormSettings) => void;
  onClose: () => void;
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
  <Tooltip tooltip={t`Action settings`}>
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
}: ActionSettingsInlineProps) => {
  const id = useUniqueId();
  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] = useToggle();
  const hasSharingPermission = isAdmin && isPublicSharingEnabled;

  const handleTogglePublic = (isPublic: boolean) => {
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
    <SidebarContent title={t`Action settings`} onClose={onClose}>
      <ActionSettingsContent>
        {action && hasSharingPermission && (
          <FormField
            title={t`Make public`}
            description={t`Creates a publicly shareable link to this action form.`}
            orientation="horizontal"
            htmlFor={`${id}-public`}
          >
            <Toggle
              id={`${id}-public`}
              value={action.public_uuid != null}
              onChange={handleTogglePublic}
            />
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
        {isModalOpen && (
          <Modal>
            <ConfirmContent
              title={t`Disable this public link?`}
              content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
              onAction={handleDisablePublicLink}
              onClose={closeModal}
            />
          </Modal>
        )}
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
