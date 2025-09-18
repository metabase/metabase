import { useDisclosure } from "@mantine/hooks";
import type { LocationDescriptorObject } from "history";
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
  location: LocationDescriptorObject;
};

export function NewTransformQueryPage({
  params,
  location,
}: NewTransformQueryPageProps) {
  const skipToSave = location?.query?.autoSave === "true";
  const { type, cardId } = getParsedParams(params);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const suggestedQuery = suggestedTransform?.source.query;

  const [initialSuggestedQuery] = useState(suggestedQuery);

  const initialQuery = initialSuggestedQuery || getInitialQuery(card, type);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <NewTransformPageBody initialQuery={initialQuery} skipToSave={skipToSave} />
  );
}

type NewTransformPageBodyProps = {
  initialQuery: DatasetQuery;
  skipToSave: boolean;
};

function NewTransformPageBody({
  initialQuery,
  skipToSave,
}: NewTransformPageBodyProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(skipToSave);
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

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  const onRejectProposed = () => dispatch(setSuggestedTransform(undefined));
  const onAcceptProposed = (query: DatasetQuery) => {
    handleSaveClick(query);
  };

  const suggestedQuery = suggestedTransform?.source.query;

  const initQuery =
    initialQuery.type === "native" && initialQuery.native.query.length > 0
      ? initialQuery
      : (suggestedQuery ?? initialQuery);

  const proposedQuery =
    suggestedQuery?.type === "native" &&
    initQuery.type === "native" &&
    suggestedQuery.native.query === initQuery.native.query
      ? undefined
      : suggestedQuery;

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
    <AdminSettingsLayout fullWidthContent>
      <QueryEditor
        initialQuery={initQuery}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
        proposedQuery={proposedQuery}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
      {isModalOpened && (
        <CreateTransformModal
          query={query}
          initValues={createTransformInitValues}
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
