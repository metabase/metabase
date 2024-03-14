import { hasMatchingParameters } from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { setErrorPage } from "metabase/redux/app";
import { DashboardApi } from "metabase/services";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import {
  cardIsEquivalent,
  cardParametersAreEquivalent,
} from "metabase-lib/v1/queries/utils/card";
import type { Card, Parameter } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

type BlankQueryOptions = {
  db?: string;
  table?: string;
  segment?: string;
  metric?: string;
};

type QueryParams = BlankQueryOptions & {
  slug?: string;
  objectId?: string;
};

function shouldPropagateDashboardParameters({
  cardId,
  deserializedCard,
  originalCard,
}: {
  cardId?: number;
  deserializedCard: Card;
  originalCard?: Card;
}): boolean {
  if (cardId && deserializedCard.parameters) {
    return true;
  } else if (!originalCard) {
    return false;
  } else {
    const equivalentCards = cardIsEquivalent(deserializedCard, originalCard);
    const differentParameters = !cardParametersAreEquivalent(
      deserializedCard,
      originalCard,
    );
    return equivalentCards && differentParameters;
  }
}

async function verifyMatchingDashcardAndParameters({
  dispatch,
  dashboardId,
  dashcardId,
  cardId,
  parameters,
}: {
  dispatch: Dispatch;
  dashboardId: number;
  dashcardId: number;
  cardId: number;
  parameters: Parameter[];
}) {
  try {
    const dashboard = await DashboardApi.get({ dashId: dashboardId });
    if (
      !hasMatchingParameters({
        dashboard,
        dashcardId,
        cardId,
        parameters,
      })
    ) {
      dispatch(setErrorPage({ status: 403 }));
    }
  } catch (error) {
    dispatch(setErrorPage(error));
  }
}

export function getParameterValuesForQuestion({
  card,
  queryParams,
  metadata,
}: {
  card: Card;
  queryParams?: QueryParams;
  metadata: Metadata;
}) {
  const parameters = getCardUiParameters(card, metadata);
  return getParameterValuesByIdFromQueryParams(parameters, queryParams ?? {});
}

/**
 * Merges .parameters, .dashboardId, and .dashcardId props from deserializedCard into card.
 * Sets an error page if there have been permissions or data changes to a dashboard such that:
 *  - If the user loses permissions to view the dashboard, the user will be navigated to an unauthed screen.
 *  - If the card is removed from the dashboard or some of the parameters mapped to it have been removed,
 *    the user will be navigated to an unauthed screen.
 * See https://github.com/metabase/metabase/pull/19300 for the origin of the error handling.
 */
export async function propagateDashboardParameters({
  card,
  deserializedCard,
  originalCard,
  dispatch,
}: {
  card: Card;
  deserializedCard: Card; // DashCard (has dashboardId and dashcardId)
  originalCard?: Card;
  dispatch: Dispatch;
}) {
  const cardId = card.id;
  if (
    shouldPropagateDashboardParameters({
      cardId,
      deserializedCard,
      originalCard,
    })
  ) {
    const { dashboardId, dashcardId, parameters } = deserializedCard;
    await verifyMatchingDashcardAndParameters({
      dispatch,
      cardId,
      dashboardId: dashboardId as number,
      dashcardId: dashcardId as number,
      parameters: parameters as Parameter[],
    });
    card.parameters = parameters;
    card.dashboardId = dashboardId;
    card.dashcardId = dashcardId;
  }
  return card;
}
