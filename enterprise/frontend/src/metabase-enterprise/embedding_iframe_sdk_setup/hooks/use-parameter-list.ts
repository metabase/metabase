import { useMemo } from "react";
import { useLatest } from "react-use";

import { skipToken, useGetCardQuery, useGetDashboardQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Parameter } from "metabase-types/api";

import type { EmbedType } from "../types";

interface UseParameterListProps {
  selectedType: EmbedType;
  dashboardId?: number;
  questionId?: number;
}

export const useParameterList = ({
  selectedType,
  dashboardId,
  questionId,
}: UseParameterListProps) => {
  // Fetch dashboard/question data for parameter extraction
  const { data: dashboard, isLoading: isDashboardLoading } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  const { data: card, isLoading: isCardLoading } = useGetCardQuery(
    questionId ? { id: questionId as number } : skipToken,
  );

  const metadata = useSelector(getMetadata);
  const metadataRef = useLatest(metadata);

  // Extract parameters from the loaded dashboard/card
  const availableParameters = useMemo((): Parameter[] => {
    if (selectedType === "dashboard" && dashboard) {
      return dashboard.parameters || [];
    } else if (selectedType === "chart" && card) {
      return getCardUiParameters(card as Card, metadataRef.current) || [];
    }

    return [];
  }, [selectedType, dashboard, card, metadataRef]);

  const isLoadingParameters = isDashboardLoading || isCardLoading;

  return {
    availableParameters,
    isLoadingParameters,
    dashboard,
    card,
  };
};
