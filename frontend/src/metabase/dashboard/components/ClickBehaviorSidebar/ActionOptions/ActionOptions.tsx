import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import Actions from "metabase/entities/actions";

import ClickMappings from "metabase/dashboard/components/ClickMappings";
import { updateButtonActionMapping } from "metabase/dashboard/actions";

import type {
  ActionButtonDashboardCard,
  ActionButtonParametersMapping,
  ClickBehaviorParameterMapping,
  WritebackAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { UiParameter } from "metabase/parameters/types";

import { Heading, SidebarContent } from "../ClickBehaviorSidebar.styled";

import {
  turnClickBehaviorParameterMappingsIntoDashCardMappings,
  turnDashCardParameterMappingsIntoClickBehaviorMappings,
} from "./utils";
import ActionOptionItem from "./ActionOptionItem";
import { ClickMappingsContainer } from "./ActionOptions.styled";

interface WritebackActionClickBehavior {
  type: "action";
  parameterMapping?: ClickBehaviorParameterMapping;
}

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

  const clickBehavior = useMemo(() => {
    if (!selectedAction) {
      return { type: "action" };
    }
    const parameterMapping =
      turnDashCardParameterMappingsIntoClickBehaviorMappings(
        dashcard,
        parameters,
        selectedAction,
      );
    return { type: "action", parameterMapping };
  }, [dashcard, parameters, selectedAction]);

  const handleActionSelected = useCallback(
    (action: WritebackAction) => {
      onUpdateButtonActionMapping(dashcard.id, {
        action_id: action.id,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  const handleParameterMappingChange = useCallback(
    (nextClickBehavior: WritebackActionClickBehavior) => {
      const { parameterMapping } = nextClickBehavior;

      const parameterMappings =
        parameterMapping && selectedAction
          ? turnClickBehaviorParameterMappingsIntoDashCardMappings(
              parameterMapping,
              selectedAction,
            )
          : null;

      onUpdateButtonActionMapping(dashcard.id, {
        parameter_mappings: parameterMappings,
      });
    },
    [dashcard, selectedAction, onUpdateButtonActionMapping],
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
          <ClickMappings
            isAction
            object={selectedAction}
            dashcard={dashcard}
            clickBehavior={clickBehavior}
            updateSettings={handleParameterMappingChange}
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
