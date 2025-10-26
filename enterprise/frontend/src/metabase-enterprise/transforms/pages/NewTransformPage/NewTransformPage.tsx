import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { Transform, TransformSource } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";

import { CreateTransformModal } from "./CreateTransformModal";

type NewTransformPageProps = {
  initialSource: TransformSource;
};

function NewTransformPage({ initialSource }: NewTransformPageProps) {
  const [name, setName] = useState(t`New transform`);
  const [source, setSource] = useState(initialSource);
  const [isOpened, { open, close }] = useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  return (
    <>
      {source.type === "query" && (
        <TransformEditor
          name={name}
          source={source}
          isSaving={false}
          isSourceDirty
          onNameChange={setName}
          onSourceChange={setSource}
          onSave={open}
        />
      )}
      {isOpened && (
        <CreateTransformModal
          name={name}
          source={source}
          onCreate={handleCreate}
          onClose={close}
        />
      )}
    </>
  );
}

export function NewQueryTransformPage() {
  const initialSource = useMemo((): TransformSource => {
    const question = Question.create({ DEPRECATED_RAW_MBQL_type: "query" });
    return {
      type: "query",
      query: question.datasetQuery(),
    };
  }, []);

  return <NewTransformPage initialSource={initialSource} />;
}

export function NewNativeTransformPage() {
  const initialSource = useMemo((): TransformSource => {
    const question = Question.create({ DEPRECATED_RAW_MBQL_type: "native" });
    return {
      type: "query",
      query: question.datasetQuery(),
    };
  }, []);

  return <NewTransformPage initialSource={initialSource} />;
}

type NewCardTransformPageParams = {
  cardId: string;
};

type NewCardTransformPageProps = {
  params: NewCardTransformPageParams;
};

export function NewCardTransformPage({ params }: NewCardTransformPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);

  const initialSource = useMemo((): TransformSource | undefined => {
    if (card != null) {
      return {
        type: "query",
        query: card.dataset_query,
      };
    }
  }, [card]);

  if (isLoading || error != null || initialSource == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <NewTransformPage initialSource={initialSource} />;
}
