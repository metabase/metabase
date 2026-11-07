import { useMemo, useRef } from "react";
import { usePrevious } from "react-use";

import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";
import { useQuestionFromCardBuilder } from "metabase/metadata-store";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

type UseParameterListProps = {
  experience: SdkIframeEmbedSetupExperience;
  resource: Dashboard | Card | null;
};

export const useAvailableParameters = ({
  experience,
  resource,
}: UseParameterListProps) => {
  const buildQuestion = useQuestionFromCardBuilder();

  // We need initial available parameters to display the `discard changes` button
  // and reset user selected parameters back to initial parameters
  const initialAvailableParametersRef = useRef<Parameter[] | null>(null);
  const prevResourceId = usePrevious(resource?.id);

  // Extract parameters from the loaded dashboard/card
  const availableParameters = useMemo((): Parameter[] => {
    if (!resource) {
      return [];
    }

    if (experience === "dashboard") {
      // Unjustified type cast. FIXME
      const dashboard = resource as Dashboard;
      return getSavedDashboardUiParameters(
        dashboard.dashcards,
        dashboard.parameters,
        dashboard.param_fields,
      );
    } else if (experience === "chart") {
      // Unjustified type cast. FIXME
      const card = resource as Card;
      return buildQuestion(card).parameters();
    }

    return [];
  }, [resource, experience, buildQuestion]);

  // Reset initial parameters when the resource changes
  if (resource?.id !== prevResourceId) {
    initialAvailableParametersRef.current = null;
  }

  if (resource && initialAvailableParametersRef.current === null) {
    initialAvailableParametersRef.current = availableParameters;
  }

  return {
    availableParameters,
    initialAvailableParameters: initialAvailableParametersRef.current,
  };
};
