import { useMemo } from "react";
import { P, match } from "ts-pattern";

import { useDashboardContext } from "metabase/dashboard/context";
import type {
  DashboardCardMenuCustomElement,
  DashboardCardMenuObject,
} from "metabase/dashboard/context/types/dashcard-menu";
import { useDashCardSeries } from "metabase/dashboard/hooks/use-dashcard-series";
import { getDashcardData } from "metabase/dashboard/selectors";
import { isQuestionCard } from "metabase/dashboard/utils";
import {
  isCustomElementFn,
  isCustomMenuConfig,
  isReactNode,
} from "metabase/dashboard/utils/dashcard-menu-resolver";
import { getSeriesForDashcard } from "metabase/dashboard/utils/dashcard-series";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import type { EmbedResourceDownloadOptions } from "metabase/public/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { InternalQuery } from "metabase-lib/v1/queries/InternalQuery";
import type { DashboardCard, Dataset } from "metabase-types/api";

import { DefaultDashCardMenu } from "./DefaultDashCardMenu";
import { canDownloadResults, canEditQuestion } from "./utils";

export const DashCardMenu = ({
  dashcard,
  onEditVisualization,
}: {
  dashcard: DashboardCard;
  onEditVisualization?: () => void;
}) => {
  const { dashcardMenu, dashboard } = useDashboardContext();

  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return isQuestionCard(dashcard.card)
      ? new Question(dashcard.card, metadata)
      : null;
  }, [dashcard.card, metadata]);
  const datasets = useSelector((state) => getDashcardData(state, dashcard.id));

  const { series: untranslatedRawSeries } = useDashCardSeries(dashcard);

  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  const { series } = useMemo(
    () => getSeriesForDashcard({ rawSeries, dashcard, datasets }),
    [rawSeries, dashcard, datasets],
  );

  const menuItems = useMemo(() => {
    if (!dashboard || !question) {
      return null;
    }

    const menuItemsProps = { question, dashboard, dashcard, series };
    const resolvedMenu = match(dashcardMenu)
      .with(P.nullish, () => null)
      .with(P.when(isReactNode), (node) => node)
      .with(P.when(isCustomElementFn), (fn: DashboardCardMenuCustomElement) => {
        if (!menuItemsProps) {
          return fn;
        }
        return fn(menuItemsProps);
      })
      .with(P.when(isCustomMenuConfig), (menu: DashboardCardMenuObject) => (
        <DefaultDashCardMenu
          dashcardMenu={menu}
          onEditVisualization={onEditVisualization}
          {...menuItemsProps}
        />
      ));

    return resolvedMenu;
  }, [
    dashboard,
    dashcard,
    dashcardMenu,
    onEditVisualization,
    question,
    series,
  ]);

  return menuItems ?? null;
};

interface ShouldRenderDashcardMenuProps {
  question: Question;
  result?: Dataset;
  isXray?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isEditing: boolean;
  downloadsEnabled: EmbedResourceDownloadOptions;
}

DashCardMenu.shouldRender = ({
  question,
  result,
  isXray,
  isPublicOrEmbedded,
  isEditing,
  downloadsEnabled,
}: ShouldRenderDashcardMenuProps) => {
  // Do not remove this check until we completely remove the old code related to Audit V1!
  // MLv2 doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  if (isPublicOrEmbedded) {
    return downloadsEnabled.results && !!result?.data && !result?.error;
  }

  return (
    !isInternalQuery &&
    !isEditing &&
    !isXray &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};
