import _ from "underscore";

import { cardIsEquivalent } from "metabase/meta/Card";

import { DashboardApi } from "metabase/services";

import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";

import { getCardUiParameters } from "metabase/parameters/utils/cards";
import { hasMatchingParameters } from "metabase/parameters/utils/dashboards";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";

import Metadata from "metabase-lib/lib/metadata/Metadata";

import { Dispatch, GetState } from "metabase-types/store";

import { Card, SavedCard } from "metabase-types/types/Card";
import { Parameter } from "metabase-types/types/Parameter";

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

function checkShouldPropagateDashboardParameters({
  cardId,
  deserializedCard,
  originalCard,
}: {
  cardId?: number;
  deserializedCard?: Card;
  originalCard?: Card;
}) {
  if (!deserializedCard) {
    return false;
  }
  if (cardId && deserializedCard.parameters) {
    return true;
  }
  if (!originalCard) {
    return false;
  }
  const equalCards = cardIsEquivalent(deserializedCard, originalCard, {
    checkParameters: false,
  });
  const differentParameters = !cardIsEquivalent(
    deserializedCard,
    originalCard,
    { checkParameters: true },
  );
  return equalCards && differentParameters;
}

async function verifyMatchingDashcardAndParameters({
  dispatch,
  dashboardId,
  dashcardId,
  cardId,
  parameters,
  metadata,
}: {
  dispatch: Dispatch;
  dashboardId: number;
  dashcardId: number;
  cardId: number;
  parameters: Parameter[];
  metadata: Metadata;
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
  return getParameterValuesByIdFromQueryParams(
    parameters,
    queryParams,
    metadata,
  );
}

export async function handleDashboardParameters(
  card: Card,
  {
    deserializedCard,
    originalCard,
    dispatch,
    getState,
  }: {
    cardId?: number;
    deserializedCard?: Card;
    originalCard?: Card;
    dispatch: Dispatch;
    getState: GetState;
  },
) {
  const cardId = (card as SavedCard).id;
  const shouldPropagateParameters = checkShouldPropagateDashboardParameters({
    cardId,
    deserializedCard,
    originalCard,
  });
  if (shouldPropagateParameters && deserializedCard) {
    const { dashboardId, dashcardId, parameters } = deserializedCard;
    const metadata = getMetadata(getState());
    await verifyMatchingDashcardAndParameters({
      dispatch,
      cardId,
      metadata,
      dashboardId: dashboardId as number,
      dashcardId: dashcardId as number,
      parameters: parameters as Parameter[],
    });

    card.parameters = parameters;
    card.dashboardId = dashboardId;
    card.dashcardId = dashcardId;
  }
}
