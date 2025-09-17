import { useEffect, useMemo } from "react";
import { useLatest } from "react-use";

import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Parameter } from "metabase-types/api";

import type { SdkIframeEmbedSetupExperience } from "../types";

interface UseParameterListProps {
  experience: SdkIframeEmbedSetupExperience;
  dashboardId?: number;
  questionId?: number;
}

export const useParameterList = ({
  experience,
  dashboardId,
  questionId,
}: UseParameterListProps) => {
  const dispatch = useDispatch();
  // Fetch dashboard/question data for parameter extraction
  const { data: dashboard, isLoading: isDashboardLoading } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  const { data: card, isLoading: isCardLoading } = useGetCardQuery(
    questionId ? { id: questionId as number } : skipToken,
  );

  const metadata = useSelector(getMetadata);

  // This prevents `availableParameters` from being updated on every metadata change,
  // which would cause unnecessary re-renders in the component using this hook.
  // See [PublicOrEmbeddedQuestion.tsx] for reference.
  const metadataRef = useLatest(metadata);

  // Extract parameters from the loaded dashboard/card
  const availableParameters = useMemo((): Parameter[] => {
    if (experience === "dashboard" && dashboard) {
      return getSavedDashboardUiParameters(
        dashboard.dashcards,
        dashboard.parameters,
        dashboard.param_fields,
        metadata,
      );
    } else if (experience === "chart" && card) {
      return getCardUiParameters(card as Card, metadataRef.current) || [];
    }

    return [];
  }, [experience, dashboard, card, metadata, metadataRef]);

  useEffect(() => {
    if (dashboard?.param_fields) {
      // This is needed to make some parameter widget populate the dropdown list
      // otherwise they will use a normal text input
      dispatch(addFields(Object.values(dashboard.param_fields).flat()));
    }
  }, [dashboard?.param_fields, dispatch]);

  const isLoadingParameters = isDashboardLoading || isCardLoading;

  return {
    availableParameters,
    isLoadingParameters,
    dashboard,
    card,
  };
};
