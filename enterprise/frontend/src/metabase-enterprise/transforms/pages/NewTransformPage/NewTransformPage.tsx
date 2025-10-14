import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import type {
  CardId,
  LegacyDatasetQuery,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import { CreateTransformModal } from "./CreateTransformModal";
import {
  getInitialPythonTransformSource,
  getInitialQueryTransformSource,
} from "./utils";

type NewTransformPageParams = {
  type?: string;
  cardId?: string;
};

type NewTransformPageParsedParams = {
  type: LegacyDatasetQuery["type"] | "python";
  cardId?: CardId;
};

type NewTransformPageProps = {
  params: NewTransformPageParams;
};

export function NewTransformPage({ params }: NewTransformPageProps) {
  const { type, cardId } = getParsedParams(params);

  const [source, setSource] = useState<TransformSource | null>(null);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSave = (newSource: TransformSource) => {
    setSource(newSource);
    openModal();
  };

  const handleCancel = () => {
    dispatch(push(getTransformListUrl()));
  };

  return (
    <>
      <NewTransformEditorBody
        type={type}
        cardId={cardId}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      {isModalOpened && source !== null && (
        <CreateTransformModal
          source={source}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}

function NewTransformEditorBody(props: {
  type: LegacyDatasetQuery["type"] | "python";
  cardId?: CardId;
  onSave: (source: TransformSource) => void;
  onCancel: () => void;
}) {
  const { type, ...rest } = props;
  if (type === "python") {
    return (
      <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
        initialSource={getInitialPythonTransformSource()}
        isNew
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
    );
  }

  return <NewQueryTransformEditorBody {...rest} type={type} />;
}

function NewQueryTransformEditorBody({
  type,
  cardId,
  onSave,
  onCancel,
}: {
  type: LegacyDatasetQuery["type"];
  cardId?: CardId;
  onSave: (source: TransformSource) => void;
  onCancel: () => void;
}) {
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <QueryEditor
      initialSource={getInitialQueryTransformSource(card, type)}
      isNew
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

function getParsedParams({
  type,
  cardId,
}: NewTransformPageParams): NewTransformPageParsedParams {
  if (type === "python") {
    return { type: "python" };
  }

  return {
    type: type === "native" ? "native" : "query",
    cardId: cardId != null ? Urls.extractEntityId(cardId) : undefined,
  };
}
