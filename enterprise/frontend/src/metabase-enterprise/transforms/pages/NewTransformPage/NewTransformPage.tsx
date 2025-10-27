import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Center } from "metabase/ui";
import type {
  DraftTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { isNotDraftSource, isSameSource } from "../../utils";

import { CreateTransformModal } from "./CreateTransformModal";
import { getNativeInitialSource, getQueryInitialSource } from "./utils";

type NewTransformPageProps = {
  initialName?: string;
  initialSource: DraftTransformSource;
  route: Route;
  isInitiallyDirty?: boolean;
};

function NewTransformPage({
  initialName = t`New transform`,
  initialSource,
  route,
  isInitiallyDirty = false,
}: NewTransformPageProps) {
  const [name, setName] = useState(initialName);
  const [source, setSource] = useState(initialSource);
  const [isOpened, { open, close }] = useDisclosure();
  const dispatch = useDispatch();

  const isDirty = useMemo(
    () =>
      isInitiallyDirty ||
      name !== initialName ||
      !isSameSource(source, initialSource),
    [name, source, initialName, initialSource, isInitiallyDirty],
  );

  const handleCreate = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.transformList()));
  };

  return (
    <>
      {source.type === "python" ? (
        <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
          name={name}
          source={source}
          isSaving={false}
          isSourceDirty
          onNameChange={setName}
          onSourceChange={setSource}
          onSave={open}
          onCancel={handleCancel}
        />
      ) : (
        <TransformEditor
          name={name}
          source={source}
          isSaving={false}
          isSourceDirty
          onNameChange={setName}
          onSourceChange={setSource}
          onSave={open}
          onCancel={handleCancel}
        />
      )}
      {isOpened && isNotDraftSource(source) && (
        <CreateTransformModal
          name={name}
          source={source}
          onCreate={handleCreate}
          onClose={close}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
  );
}

type NewQueryTransformPageProps = {
  route: Route;
};

export function NewQueryTransformPage({ route }: NewQueryTransformPageProps) {
  const initialSource = useMemo(getQueryInitialSource, []);
  return <NewTransformPage initialSource={initialSource} route={route} />;
}

type NewNativeTransformPageProps = {
  route: Route;
};

export function NewNativeTransformPage({ route }: NewNativeTransformPageProps) {
  const initialSource = useMemo(getNativeInitialSource, []);
  return <NewTransformPage route={route} initialSource={initialSource} />;
}

type NewCardTransformPageParams = {
  cardId: string;
};

type NewCardTransformPageProps = {
  params: NewCardTransformPageParams;
  route: Route;
};

export function NewCardTransformPage({
  params,
  route,
}: NewCardTransformPageProps) {
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

  return (
    <NewTransformPage
      initialSource={initialSource}
      route={route}
      isInitiallyDirty
    />
  );
}
