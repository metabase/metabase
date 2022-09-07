import React, { useCallback, useMemo } from "react";

import ClickMappings from "metabase/dashboard/components/ClickMappings";

import type {
  ActionButtonDashboardCard,
  ActionButtonParametersMapping,
  ClickBehaviorParameterMapping,
  WritebackAction,
} from "metabase-types/api";
import type { UiParameter } from "metabase/parameters/types";

import {
  turnClickBehaviorParameterMappingsIntoDashCardMappings,
  turnDashCardParameterMappingsIntoClickBehaviorMappings,
} from "./utils";

// We're reusing the ClickMappings component for mapping parameters
// ClickMappings is bound to click behavior, but for custom actions
// we're using dash cards parameter mappings in another format
// So here we need to convert these formats from one to another
// Until we introduce another mapping component or refactor ClickMappings
interface IntermediateActionClickBehavior {
  type: "action";
  parameterMapping?: ClickBehaviorParameterMapping;
}

interface ActionClickMappingsProps {
  action?: WritebackAction;
  dashcard: ActionButtonDashboardCard;
  parameters: UiParameter[];
  onChange: (parameterMappings: ActionButtonParametersMapping[] | null) => void;
}

function ActionClickMappings({
  action,
  dashcard,
  parameters,
  onChange,
}: ActionClickMappingsProps) {
  const clickBehavior = useMemo(() => {
    if (!action) {
      return { type: "action" };
    }
    const parameterMapping =
      turnDashCardParameterMappingsIntoClickBehaviorMappings(
        dashcard,
        parameters,
        action,
      );
    return { type: "action", parameterMapping };
  }, [action, dashcard, parameters]);

  const handleParameterMappingChange = useCallback(
    (nextClickBehavior: IntermediateActionClickBehavior) => {
      const { parameterMapping } = nextClickBehavior;
      if (parameterMapping && action) {
        const parameterMappings =
          turnClickBehaviorParameterMappingsIntoDashCardMappings(
            parameterMapping,
            action,
          );
        onChange(parameterMappings);
      } else {
        onChange(null);
      }
    },
    [action, onChange],
  );

  return (
    <ClickMappings
      isAction
      object={action}
      dashcard={dashcard}
      clickBehavior={clickBehavior}
      updateSettings={handleParameterMappingChange}
    />
  );
}

export default ActionClickMappings;
