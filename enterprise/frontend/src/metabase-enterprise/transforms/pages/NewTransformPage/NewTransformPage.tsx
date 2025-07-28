import type { Location } from "history";
import { useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, DatasetQuery } from "metabase-types/api";

import { NewTransformModal } from "../../components/NewTransformModal";
import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { transformListUrl } from "../../utils/urls";

type NewTransformPageParams = {
  type?: DatasetQuery["type"];
  cardId?: CardId;
};

type NewTransformPageProps = {
  location: Location;
};

export function NewTransformPage({ location }: NewTransformPageProps) {
  const { type, cardId } = getParsedParams(location);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <NewTransformPageBody initialQuery={getInitialQuery(card, type)} />;
}

type NewTransformPageBodyProps = {
  initialQuery: DatasetQuery;
};

function NewTransformPageBody({ initialQuery }: NewTransformPageBodyProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const dispatch = useDispatch();

  const handleSaveClick = (newQuery: DatasetQuery) => {
    setQuery(newQuery);
    setIsModalOpened(true);
  };

  const handleCancelClick = () => {
    dispatch(push(transformListUrl()));
  };

  const handleCloseClick = () => {
    setIsModalOpened(false);
  };

  return (
    <>
      <TransformQueryBuilder
        query={query}
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      <NewTransformModal
        query={query}
        isOpened={isModalOpened}
        onClose={handleCloseClick}
      />
    </>
  );
}

function getParsedParams(location: Location): NewTransformPageParams {
  const { type, cardId } = location.query;

  return {
    type: type === "native" ? "native" : "query",
    cardId: Urls.extractEntityId(String(cardId)),
  };
}

function getInitialQuery(
  card: Card | undefined,
  type: DatasetQuery["type"] | undefined,
) {
  return card != null
    ? card.dataset_query
    : Question.create({ type }).datasetQuery();
}
