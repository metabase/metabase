import React from "react";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Tooltip from "metabase/core/components/Tooltip";
import Button from "metabase/core/components/Button";
import Toggle from "metabase/core/components/Toggle";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { useUniqueId } from "metabase/hooks/use-unique-id";

import Icon from "metabase/components/Icon";
import type { WritebackAction, WritebackActionId } from "metabase-types/api";
import Actions from "metabase/entities/actions/actions";
import { State } from "metabase-types/store";
import {
  ActionSettingsContainer,
  ActionSettingsContent,
  ToggleContainer,
  ToggleLabel,
} from "./InlineActionSettings.styled";

interface OwnProps {
  onClose: () => void;
  actionId: WritebackActionId;
}

interface EntityLoaderProps {
  action: WritebackAction;
}

interface StateProps {
  createPublicLink: ({ id }: { id: WritebackActionId }) => void;
  deletePublicLink: ({ id }: { id: WritebackActionId }) => void;
}

type ActionSettingsInlineProps = OwnProps & EntityLoaderProps & StateProps;

export const ActionSettingsTriggerButton = ({
  onClick,
}: {
  onClick: () => void;
}) => (
  <Tooltip tooltip={t`Action settings`}>
    <Button onlyIcon onClick={onClick} icon="gear" iconSize={16} />
  </Tooltip>
);

const mapDispatchToProps = {
  createPublicLink: Actions.actions.createPublicLink,
  deletePublicLink: Actions.actions.deletePublicLink,
};

const InlineActionSettings = ({
  onClose,
  action,
  actionId,
  createPublicLink,
  deletePublicLink,
}: ActionSettingsInlineProps) => {
  const id = useUniqueId();

  const isPublic = action.public_uuid != null;

  const handleTogglePublic = (value: boolean) => {
    if (value) {
      createPublicLink({ id: actionId });
    } else {
      deletePublicLink({ id: actionId });
    }
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
          </ToggleContainer>
        </ActionSettingsContent>
      </SidebarContent>
    </ActionSettingsContainer>
  );
};

export default _.compose(
  Actions.load({
    id: (_: State, props: OwnProps) => props.actionId,
  }),
  connect(null, mapDispatchToProps),
)(InlineActionSettings) as (props: OwnProps) => JSX.Element;
