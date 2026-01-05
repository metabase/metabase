import { useEffect, useMemo, useRef } from "react";
import { useLatest, usePrevious } from "react-use";

import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

type UseParameterListProps = {
  experience: SdkIframeEmbedSetupExperience;
  resource: Dashboard | Card | null;
};

export const useAvailableParameters = ({
  experience,
  resource,
}: UseParameterListProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  // We need initial available parameters to display the `discard changes` button
  // and reset user selected parameters back to initial parameters
  const initialAvailableParametersRef = useRef<Parameter[] | null>(null);
  const prevResourceId = usePrevious(resource?.id);

  // This prevents `availableParameters` from being updated on every metadata change,
  // which would cause unnecessary re-renders in the component using this hook.
  // See [PublicOrEmbeddedQuestion.tsx] for reference.
  const metadataRef = useLatest(metadata);

  // Extract parameters from the loaded dashboard/card
  const availableParameters = useMemo((): Parameter[] => {
    if (!resource) {
      return [];
    }

    if (experience === "dashboard") {
      const dashboard = resource as Dashboard;
      return getSavedDashboardUiParameters(
        dashboard.dashcards,
        dashboard.parameters,
        dashboard.param_fields,
        metadata,
      );
    } else if (experience === "chart") {
      const card = resource as Card;
      return getCardUiParameters(card, metadataRef.current) || [];
    }

    return [];
  }, [resource, experience, metadata, metadataRef]);

  // Reset initial parameters when the resource changes
  if (resource?.id !== prevResourceId) {
    initialAvailableParametersRef.current = null;
  }

  if (resource && initialAvailableParametersRef.current === null) {
    initialAvailableParametersRef.current = availableParameters;
  }

  useEffect(() => {
    if (resource && "param_fields" in resource && resource.param_fields) {
      // This is needed to make some parameter widget populate the dropdown list
      // otherwise they will use a normal text input
      dispatch(addFields(Object.values(resource.param_fields).flat()));
    }
  }, [resource, dispatch]);

  return {
    availableParameters,
    initialAvailableParameters: initialAvailableParametersRef.current,
  };
};
