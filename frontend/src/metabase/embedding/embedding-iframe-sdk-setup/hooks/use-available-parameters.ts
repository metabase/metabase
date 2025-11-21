import { useEffect, useMemo } from "react";
import { useLatest } from "react-use";

import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Dashboard, Parameter } from "metabase-types/api";

interface UseAvailableParametersProps {
  experience: SdkIframeEmbedSetupExperience;
  resource: Dashboard | Card | null;
}

const extractParameters = (
  resource: Dashboard | Card,
  experience: SdkIframeEmbedSetupExperience,
  metadata: ReturnType<typeof getMetadata>,
): Parameter[] => {
  if (experience === "dashboard") {
    const dashboard = resource as Dashboard;
    return getSavedDashboardUiParameters(
      dashboard.dashcards,
      dashboard.parameters,
      dashboard.param_fields,
      metadata,
    );
  }

  if (experience === "chart") {
    const card = resource as Card;
    return getCardUiParameters(card, metadata) || [];
  }

  return [];
};

/**
 * Extracts available parameters from a dashboard or card resource.
 * Also adds parameter fields to Redux for dropdown widget population.
 */
export const useAvailableParameters = ({
  experience,
  resource,
}: UseAvailableParametersProps) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  // Prevents unnecessary re-renders on metadata changes
  // See PublicOrEmbeddedQuestion.tsx for reference
  const metadataRef = useLatest(metadata);

  const availableParameters = useMemo((): Parameter[] => {
    if (!resource) {
      return [];
    }

    return extractParameters(resource, experience, metadataRef.current);
  }, [resource, experience, metadataRef]);

  // Add parameter fields to Redux for dropdown widget population
  useEffect(() => {
    if (resource && "param_fields" in resource && resource.param_fields) {
      dispatch(addFields(Object.values(resource.param_fields).flat()));
    }
  }, [resource, dispatch]);

  return { availableParameters };
};
