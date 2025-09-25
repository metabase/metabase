import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import _ from "underscore";

import { skipToken, useGetCardQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import {
  getMetabotSuggestedTransform,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type {
  CardId,
  DatasetQuery,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import { CreateTransformModal } from "./CreateTransformModal";
import {
  type InitialTransformSource,
  getInitialTransformSource,
} from "./utils";

type NewTransformPageParams = {
  type?: string;
  cardId?: string;
};

type NewTransformPageParsedParams = {
  type: DatasetQuery["type"] | "python";
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

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const canUseSuggestedTransform = match({
    type,
    suggestionSourceType: suggestedTransform?.source.type,
  })
    .with({ type: "native", suggestionSourceType: "query" }, () => true)
    .with({ type: "python", suggestionSourceType: "python" }, () => true)
    .otherwise(() => false);

  const [initialSuggestedSource] = useState(
    canUseSuggestedTransform ? suggestedTransform?.source : undefined,
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const initialSource = cardId
    ? getInitialTransformSource(card, type)
    : initialSuggestedSource || getInitialTransformSource(card, type);

  return (
    <AdminSettingsLayout fullWidth>
      <NewTransformPageInner initialSource={initialSource} />
    </AdminSettingsLayout>
  );
}

export function NewTransformPageInner({
  initialSource,
}: {
  initialSource: InitialTransformSource;
}) {
  // TODO: fix type
  const [source, setSource] = useState<TransformSource | undefined>(
    initialSource as any,
  );

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

  const onRejectProposed = () => dispatch(setSuggestedTransform(undefined));

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;
  const proposedSource = useMemo(
    () =>
      _.isEqual(suggestedTransform?.source, initialSource)
        ? undefined
        : suggestedTransform?.source,
    [suggestedTransform, initialSource],
  );

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
      <NewTransformEditorBody
        initialSource={initialSource}
        proposedSource={proposedSource}
        onSave={handleSave}
        onCancel={handleCancel}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={handleSave}
      />
      {isModalOpened && source && (
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

interface NewTransformEditorBody {
  initialSource: InitialTransformSource;
  proposedSource?: TransformSource;
  onSave: (source: TransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: TransformSource) => void;
}

function NewTransformEditorBody({
  initialSource,
  proposedSource,
  onSave,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
}: NewTransformEditorBody) {
  if (initialSource.type === "python") {
    return (
      <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
        initialSource={initialSource}
        proposedSource={
          proposedSource?.type === "python" ? proposedSource : undefined
        }
        isNew
        onSave={onSave}
        onCancel={onCancel}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
    );
  }

  return (
    <QueryEditor
      initialSource={initialSource}
      proposedSource={
        proposedSource?.type === "query" ? proposedSource : undefined
      }
      isNew
      onSave={onSave}
      onCancel={onCancel}
      onRejectProposed={onRejectProposed}
      onAcceptProposed={onAcceptProposed}
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
