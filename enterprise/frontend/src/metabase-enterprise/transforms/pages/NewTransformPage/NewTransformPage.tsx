import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getMetabotSuggestedTransform } from "metabase-enterprise/metabot/state";
import { useSourceState } from "metabase-enterprise/transforms/hooks/use-source-state";
import type {
  CardId,
  DatasetQuery,
  DraftTransform,
  DraftTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor, QueryEditorProvider } from "../../components/QueryEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import {
  CreateTransformModal,
  type NewTransformValues,
} from "./CreateTransformModal";
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
  location: Location;
  params: NewTransformPageParams;
  route: Route;
};

export function NewTransformPage({
  location,
  route,
  params,
}: NewTransformPageProps) {
  const { type, cardId } = getParsedParams(params);

  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId ? { id: cardId } : skipToken);

  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <AdminSettingsLayout fullWidth>
      <NewTransformPageInner
        route={route}
        location={location}
        initialSource={getInitialTransformSource(
          card,
          type,
          suggestedTransform,
        )}
      />
    </AdminSettingsLayout>
  );
}

export function NewTransformPageInner({
  initialSource,
  location,
  route,
}: {
  initialSource: InitialTransformSource;
  location: Location;
  route: Route;
}) {
  const {
    source,
    setSource,
    suggestedTransform,
    proposedSource,
    acceptProposed,
    clearProposed,
    isDirty,
  } = useSourceState<TransformSource | DraftTransformSource>(
    undefined,
    initialSource,
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
    setSource(initialSource);
    dispatch(push(getTransformListUrl()));
    clearProposed();
  };

  const [createTransformInitValues, setCreateTransformInitValues] = useState<
    Partial<NewTransformValues> | undefined
  >(undefined);

  const handleAcceptProposed = (source: TransformSource) => {
    if (suggestedTransform) {
      setCreateTransformInitValues({
        name: suggestedTransform.name,
        description: suggestedTransform.description,
        targetName: suggestedTransform.target.name,
      });
    }
    acceptProposed(source);
  };

  return (
    <QueryEditorProvider initialQuery={source.query}>
      <NewTransformEditorBody
        initialSource={initialSource}
        proposedSource={proposedSource}
        onChange={setSource}
        onSave={handleSave}
        onCancel={handleCancel}
        onRejectProposed={clearProposed}
        onAcceptProposed={handleAcceptProposed}
      />
      {isModalOpened && source && (
        <CreateTransformModal
          source={source as TransformSource}
          initValues={createTransformInitValues}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal
        key={location.key}
        isEnabled={isDirty}
        route={route}
        onConfirm={clearProposed}
      />
    </>
  );
}

interface NewTransformEditorBody {
  initialSource: InitialTransformSource;
  proposedSource?: TransformSource;
  onChange: (source: DraftTransform["source"]) => void;
  onSave: (source: TransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: TransformSource) => void;
}

function NewTransformEditorBody({
  initialSource,
  proposedSource,
  onChange,
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
        onChange={onChange}
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
      onChange={onChange}
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
