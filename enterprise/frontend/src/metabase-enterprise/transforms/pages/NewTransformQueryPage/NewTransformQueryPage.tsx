import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId, DatasetQuery, Transform } from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import { CreateTransformModal } from "./CreateTransformModal";

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
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSaveClick = (newQuery: DatasetQuery) => {
    setQuery(newQuery);
    openModal();
  };

  const handleCancelClick = () => {
    dispatch(push(getTransformListUrl()));
  };

  // TODO: move into redux state
  const [proposedQuery, setProposedQuery] = useState<DatasetQuery | undefined>(
    () => getProposedQuery(initialQuery),
  );
  const clearProposed = () => setProposedQuery(undefined);

  return (
    <AdminSettingsLayout fullWidthContent>
      <QueryEditor
        initialQuery={initialQuery}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
        proposedQuery={proposedQuery}
        clearProposed={clearProposed}
      />
      {isModalOpened && (
        <CreateTransformModal
          query={query}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </AdminSettingsLayout>
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

// TODO: factor in metabot state
function getProposedQuery(initialQuery: DatasetQuery | undefined) {
  return Question.create({
    type: "native",
    dataset_query: {
      database: initialQuery?.database ?? null,
      type: "native",
      native: {
        query: "SELECT * FROM ORDERS;",
      },
    },
  }).datasetQuery();
}
