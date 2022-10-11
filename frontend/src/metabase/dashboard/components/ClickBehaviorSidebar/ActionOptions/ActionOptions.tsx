import React, { useCallback } from "react";
import { connect } from "react-redux";

import { updateButtonActionMapping } from "metabase/dashboard/actions";

import ActionPicker from "metabase/containers/ActionPicker";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  WritebackAction,
} from "metabase-types/api";
import type { State } from "metabase-types/store";
import type { UiParameter } from "metabase/parameters/types";

import { SidebarContent } from "../ClickBehaviorSidebar.styled";

import ActionClickMappings from "./ActionClickMappings";
import { ClickMappingsContainer } from "./ActionOptions.styled";

import { ensureParamsHaveNames } from "./utils";

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

  const handleParameterMappingChange = useCallback(
    (parameter_mappings: ActionParametersMapping[] | null) => {
      onUpdateButtonActionMapping(dashcard.id, {
        parameter_mappings,
      });
    },
    [dashcard, onUpdateButtonActionMapping],
  );

  if (!selectedAction) {
    return null;
  }

  return (
    <SidebarContent>
      <ClickMappingsContainer>
        <ActionClickMappings
          action={{
            ...selectedAction,
            parameters: ensureParamsHaveNames(selectedAction?.parameters ?? []),
          }}
          dashcard={dashcard}
          parameters={parameters}
          onChange={handleParameterMappingChange}
        />
      </ClickMappingsContainer>
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
)(ActionOptions);
