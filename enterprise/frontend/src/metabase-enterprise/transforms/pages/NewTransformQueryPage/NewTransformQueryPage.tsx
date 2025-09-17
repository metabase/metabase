import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  getMetabotSuggestedTransform,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
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
import { NewPythonTransformPage } from "../NewPythonTransformPage";

import { CreateTransformModal } from "./CreateTransformModal";

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

  return (
    <AdminSettingsLayout fullWidth>
      {type === "python" ? (
        <NewPythonTransformPage />
      ) : (
        <NewQueryTransformQueryPage type={type} cardId={cardId} />
      )}
    </AdminSettingsLayout>
  );
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

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const suggestedSource =
    suggestedTransform?.source.type === "query"
      ? suggestedTransform?.source
      : undefined;

  const [initialSuggestedSource] = useState(suggestedSource);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const initialSource = initialSuggestedSource || getInitialSource(card, type);

  return <NewTransformPageBody initialSource={initialSource} />;
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

  const handleSave = (newSource: QueryTransformSource) => {
    setSource(newSource);
    openModal();
  };

  const handleCancelClick = () => {
    dispatch(push(getTransformListUrl()));
  };

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  const onRejectProposed = () => dispatch(setSuggestedTransform(undefined));

  const suggestedSource =
    suggestedTransform?.source.type === "query"
      ? suggestedTransform?.source
      : undefined;

  const initSource =
    initialSource.query.type === "native" &&
    initialSource.query.native.query.length > 0
      ? initialSource
      : (suggestedSource ?? initialSource);

  const proposedSource =
    suggestedSource?.query.type === "native" &&
    initSource.query.type === "native" &&
    suggestedSource.query.native.query === suggestedSource.query.native.query
      ? undefined
      : suggestedSource;

  const createTransformInitValues = useMemo(
    () =>
      suggestedTransform
        ? {
            name: suggestedTransform.name,
            description: suggestedTransform.description,
            targetName: suggestedTransform.target.name,
            // TODO: enabling this breaks the UI for some reason...
            // targetSchema: suggestedTransform.target.schema,
          }
        : undefined,
    [suggestedTransform],
  );

  return (
    <>
      <QueryEditor
        initialSource={initSource}
        isNew
        onSave={handleSave}
        onCancel={handleCancelClick}
        proposedSource={proposedSource}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={handleSave}
      />
      {isModalOpened && (
        <CreateTransformModal
          source={source}
          initValues={createTransformInitValues}
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
