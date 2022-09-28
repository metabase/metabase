import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { updateButtonActionMapping } from "metabase/dashboard/actions";
import { updateSettings } from "metabase/visualizations/lib/settings";

import ActionPicker from "metabase/containers/ActionPicker";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  WritebackAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { UiParameter } from "metabase/parameters/types";

import { Heading, SidebarContent } from "../ClickBehaviorSidebar.styled";

import ActionClickMappings from "./ActionClickMappings";
import {
  ClickMappingsContainer,
  ActionPickerWrapper,
} from "./ActionOptions.styled";

interface ActionOptionsOwnProps {
  dashcard: ActionDashboardCard;
  parameters: UiParameter[];
}

interface ActionOptionsDispatchProps {
  onUpdateButtonActionMapping: (
    dashCardId: number,
    settings: {
      card_id?: number | null;
      action?: WritebackAction | null;
      parameter_mappings?: ActionParametersMapping[] | null;
      visualization_settings?: ActionDashboardCard["visualization_settings"];
    },
  ) => void;
}

type ActionOptionsProps = ActionOptionsOwnProps & ActionOptionsDispatchProps;

const mapDispatchToProps = {
  onUpdateButtonActionMapping: updateButtonActionMapping,
};

function ActionOptions({
  dashcard,
  parameters,
  onUpdateButtonActionMapping,
}: ActionOptionsProps) {
  const selectedAction = dashcard.action;

  const handleActionSelected = useCallback(
    (action: WritebackAction) => {
      onUpdateButtonActionMapping(dashcard.id, {
        card_id: action.model_id,
        action,
        visualization_settings: updateSettings(
          { 
			"button.label": action.name,
			action_slug: action.slug, // :-( so hacky
		  },
          dashcard.visualization_settings,
        ),
        // Clean mappings from previous action
        // as they're most likely going to be irrelevant
        parameter_mappings: null,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  const handleParameterMappingChange = useCallback(
    (parameter_mappings: ActionParametersMapping[] | null) => {
      onUpdateButtonActionMapping(dashcard.id, {
        parameter_mappings,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  return (
    <ActionPickerWrapper>
      <ActionPicker value={selectedAction} onChange={handleActionSelected} />

      {!!selectedAction && (
        <ClickMappingsContainer>
          <ActionClickMappings
            action={selectedAction}
            dashcard={dashcard}
            parameters={parameters}
            onChange={handleParameterMappingChange}
          />
        </ClickMappingsContainer>
      )}
    </ActionPickerWrapper>
  );
}

function ActionOptionsContainer(props: ActionOptionsProps) {
  return (
    <SidebarContent>
      <Heading className="text-medium">{t`Pick an action`}</Heading>
      <ActionOptions
        dashcard={props.dashcard}
        parameters={props.parameters}
        onUpdateButtonActionMapping={props.onUpdateButtonActionMapping}
      />
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
