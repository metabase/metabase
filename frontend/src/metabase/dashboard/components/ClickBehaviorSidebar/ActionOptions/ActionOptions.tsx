import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Actions from "metabase/entities/actions";

import { updateButtonActionMapping } from "metabase/dashboard/actions";

import type {
  ActionButtonDashboardCard,
  ActionButtonParametersMapping,
  WritebackAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { UiParameter } from "metabase/parameters/types";

import { Heading, SidebarContent } from "../ClickBehaviorSidebar.styled";

import ActionClickMappings from "./ActionClickMappings";
import ActionOptionItem from "./ActionOptionItem";
import { ClickMappingsContainer } from "./ActionOptions.styled";

interface ActionOptionsOwnProps {
  dashcard: ActionButtonDashboardCard;
  parameters: UiParameter[];
}

interface ActionOptionsDispatchProps {
  onUpdateButtonActionMapping: (
    dashCardId: number,
    settings: {
      action_id?: number | null;
      parameter_mappings?: ActionButtonParametersMapping[] | null;
    },
  ) => void;
}

type ActionOptionsProps = ActionOptionsOwnProps & ActionOptionsDispatchProps;

const mapDispatchToProps = {
  onUpdateButtonActionMapping: updateButtonActionMapping,
};

function ActionOptions({
  actions,
  dashcard,
  parameters,
  onUpdateButtonActionMapping,
}: ActionOptionsProps & { actions: WritebackAction[] }) {
  const connectedActionId = dashcard.action_id;

  const selectedAction = actions.find(
    action => action.id === connectedActionId,
  );

  const handleActionSelected = useCallback(
    (action: WritebackAction) => {
      onUpdateButtonActionMapping(dashcard.id, {
        action_id: action.id,

        // Clean mappings from previous action
        // as they're most likely going to be irrelevant
        parameter_mappings: null,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  const handleParameterMappingChange = useCallback(
    (parameter_mappings: ActionButtonParametersMapping[] | null) => {
      onUpdateButtonActionMapping(dashcard.id, {
        parameter_mappings,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  return (
    <>
      {actions.map(action => (
        <ActionOptionItem
          key={action.id}
          name={action.name}
          description={action.description}
          isSelected={action.id === connectedActionId}
          onClick={() => handleActionSelected(action)}
        />
      ))}
      {selectedAction && (
        <ClickMappingsContainer>
          <ActionClickMappings
            action={selectedAction}
            dashcard={dashcard}
            parameters={parameters}
            onChange={handleParameterMappingChange}
          />
        </ClickMappingsContainer>
      )}
    </>
  );
}

function ActionOptionsContainer(props: ActionOptionsProps) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick an action`}</Heading>
      <Actions.ListLoader loadingAndErrorWrapper={false}>
        {({ actions = [] }: { actions: WritebackAction[] }) => (
          <ActionOptions {...props} actions={actions} />
        )}
      </Actions.ListLoader>
    </SidebarContent>
  );
}

export default connect<
  unknown,
  ActionOptionsDispatchProps,
  ActionOptionsOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(ActionOptionsContainer);
