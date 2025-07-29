import { useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  CreateTransformRequest,
  DatasetQuery,
  TransformTarget,
} from "metabase-types/api";

import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { TransformTargetModal } from "../../components/TransformTargetModal";
import { getTransformListUrl } from "../../utils/urls";

type NewTransformQueryPageParams = {
  type?: string;
  cardId?: string;
};

type NewTransformQueryPageParsedParams = {
  type?: DatasetQuery["type"];
  cardId?: CardId;
};

type NewTransformQueryPageProps = {
  params: NewTransformQueryPageParams;
};

export function NewTransformQueryPage({ params }: NewTransformQueryPageProps) {
  const { type, cardId } = getParsedParams(params);
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
  const [createTransform] = useCreateTransformMutation();

  const handleSave = async (newTarget: TransformTarget) => {
    await createTransform(getCreateRequest(query, newTarget)).unwrap();
  };

  const handleSaveClick = (newQuery: DatasetQuery) => {
    setQuery(newQuery);
    setIsModalOpened(true);
  };

  const handleCancelClick = () => {
    dispatch(push(getTransformListUrl()));
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
      {query.database != null && (
        <TransformTargetModal
          databaseId={query.database}
          isOpened={isModalOpened}
          onSubmit={handleSave}
          onClose={handleCloseClick}
        />
      )}
    </>
  );
}

function getParsedParams({
  type,
  cardId,
}: NewTransformQueryPageParams): NewTransformQueryPageParsedParams {
  return {
    type: type === "native" ? "native" : "query",
    cardId: cardId != null ? Urls.extractEntityId(cardId) : undefined,
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

function getCreateRequest(
  query: DatasetQuery,
  target: TransformTarget,
): CreateTransformRequest {
  return {
    name: target.name,
    source: {
      type: "query",
      query,
    },
    target,
  };
}
