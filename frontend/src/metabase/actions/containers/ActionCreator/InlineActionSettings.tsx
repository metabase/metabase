import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";

import type { WritebackAction, WritebackActionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Tooltip from "metabase/core/components/Tooltip";
import Button from "metabase/core/components/Button";
import Toggle from "metabase/core/components/Toggle";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { useUniqueId } from "metabase/hooks/use-unique-id";

import Icon from "metabase/components/Icon";
import Actions from "metabase/entities/actions/actions";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { useToggle } from "metabase/hooks/use-toggle";
import CopyWidget from "metabase/components/CopyWidget";

import {
  ActionSettingsContainer,
  ActionSettingsContent,
  CopyWidgetContainer,
  ToggleContainer,
  ToggleLabel,
} from "./InlineActionSettings.styled";

interface OwnProps {
  action: WritebackAction;
  onClose: () => void;
}

interface StateProps {
  siteUrl: string;
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
});

const mapDispatchToProps: DispatchProps = {
  onCreatePublicLink: Actions.actions.createPublicLink,
  onDeletePublicLink: Actions.actions.deletePublicLink,
};

const InlineActionSettings = ({
  action,
  siteUrl,
  onCreatePublicLink,
  onDeletePublicLink,
  onClose,
}: ActionSettingsInlineProps) => {
  const id = useUniqueId();
  const publicUuid = action.public_uuid;
  const isPublic = publicUuid != null;

  const [isModalOpen, { turnOn: openModal, turnOff: closeModal }] = useToggle();

  const handleTogglePublic = (isPublic: boolean) => {
    if (isPublic) {
      onCreatePublicLink({ id: action.id });
    } else {
      openModal();
    }
  };

  const handleDisablePublicLink = () => {
    onDeletePublicLink({ id: action.id });
  };

  return (
    <ActionSettingsContainer>
      <SidebarContent title={t`Action settings`} onClose={onClose}>
        <ActionSettingsContent>
          <ToggleContainer>
            <span>
              <ToggleLabel htmlFor={id}>{t`Make public`}</ToggleLabel>
              <Tooltip
                tooltip={t`Creates a publicly shareable link to this action.`}
              >
                <Icon name="info" size={10} />
              </Tooltip>
            </span>
            <Toggle id={id} value={isPublic} onChange={handleTogglePublic} />
            <Modal isOpen={isModalOpen}>
              <ConfirmContent
                title={t`Disable this public link?`}
                content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
                onAction={handleDisablePublicLink}
                onClose={closeModal}
              />
            </Modal>
          </ToggleContainer>
          {isPublic && (
            <CopyWidgetContainer>
              <CopyWidget
                value={Urls.publicAction(siteUrl, publicUuid)}
                aria-label={t`Public action link URL`}
              />
            </CopyWidgetContainer>
          )}
        </ActionSettingsContent>
      </SidebarContent>
    </ActionSettingsContainer>
  );
};

export default connect<StateProps, DispatchProps, OwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(InlineActionSettings);
