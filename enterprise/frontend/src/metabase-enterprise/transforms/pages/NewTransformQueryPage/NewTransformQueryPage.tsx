import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  DatasetQuery,
  QueryTransformSource,
  Transform,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import { CreateTransformModal } from "./CreateTransformModal";
import { NewPythonTransformPage } from "./NewPythonTransformPage";

type NewTransformQueryPageParams = {
  type?: string;
  cardId?: string;
};

type NewTransformQueryPageParsedParams = {
  type?: DatasetQuery["type"] | "python";
  cardId?: CardId;
};

type NewTransformQueryPageProps = {
  params: NewTransformQueryPageParams;
};

export function NewTransformQueryPage({ params }: NewTransformQueryPageProps) {
  const { type, cardId } = getParsedParams(params);
  if (type === "python") {
    return <NewPythonTransformPage />;
  }

  return <NewQueryTransformQueryPage type={type} cardId={cardId} />;
}

function NewQueryTransformQueryPage({
  type,
  cardId,
}: {
  type?: DatasetQuery["type"];
  cardId?: CardId;
}) {
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <NewTransformPageBody initialSource={getInitialSource(card, type)} />;
}

type NewTransformPageBodyProps = {
  initialSource: QueryTransformSource;
};

function NewTransformPageBody({ initialSource }: NewTransformPageBodyProps) {
  const [source, setSource] = useState(initialSource);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSaveClick = (newSource: QueryTransformSource) => {
    setSource(newSource);
    openModal();
  };

  const handleCancelClick = () => {
    dispatch(push(getTransformListUrl()));
  };

  return (
    <>
      <QueryEditor
        initialSource={initialSource}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      {isModalOpened && (
        <CreateTransformModal
          source={source}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}

function getParsedParams({
  type,
  cardId,
}: NewTransformQueryPageParams): NewTransformQueryPageParsedParams {
  if (type === "python") {
    return { type: "python" };
  }

  return {
    type: type === "native" ? "native" : "query",
    cardId: cardId != null ? Urls.extractEntityId(cardId) : undefined,
  };
}

function getInitialSource(
  card: Card | undefined,
  type: DatasetQuery["type"] | undefined,
) {
  const query =
    card != null
      ? card.dataset_query
      : Question.create({ type }).datasetQuery();

  return { type: "query" as const, query };
}
