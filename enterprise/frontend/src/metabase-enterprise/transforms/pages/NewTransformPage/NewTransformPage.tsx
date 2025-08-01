import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Modal } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, DatasetQuery, Transform } from "metabase-types/api";

import { TransformQueryEditor } from "../../components/TransformQueryEditor";
import { getOverviewPageUrl, getTransformUrl } from "../../urls";

import { NewTransformForm } from "./NewTransformForm";

type NewTransformPageParams = {
  type?: string;
  cardId?: string;
};

type NewTransformPageParsedParams = {
  type?: DatasetQuery["type"];
  cardId?: CardId;
};

type NewTransformPageProps = {
  params: NewTransformPageParams;
};

export function NewTransformPage({ params }: NewTransformPageProps) {
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
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleSave = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSaveClick = (newQuery: DatasetQuery) => {
    setQuery(newQuery);
    openModal();
  };

  const handleCancelClick = () => {
    dispatch(push(getOverviewPageUrl()));
  };

  return (
    <>
      <TransformQueryEditor
        query={query}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      {isModalOpened && (
        <Modal
          title={t`New transform`}
          opened={isModalOpened}
          padding="xl"
          onClose={closeModal}
        >
          <NewTransformForm
            query={query}
            onSave={handleSave}
            onCancel={closeModal}
          />
        </Modal>
      )}
    </>
  );
}

function getParsedParams({
  type,
  cardId,
}: NewTransformPageParams): NewTransformPageParsedParams {
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
