import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useState } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import { skipToken, useGetCardQuery } from "metabase/api";
import { ResizeHandle } from "metabase/bench/components/BenchApp";
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
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import {
  type TransformEditorValue,
  useQueryEditor,
} from "../../hooks/use-query-editor";
import { getTransformListUrl, getTransformUrl } from "../../urls";
import { TransformDrawer } from "../TransformPage";

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
    <>
      <NewTransformPageInner
        route={route}
        location={location}
        initialSource={getInitialTransformSource(
          card,
          type,
          suggestedTransform,
        )}
      />
    </>
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
  } = useSourceState(undefined, initialSource);

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

  const queryEditor = useQueryEditor(source.query, proposedSource?.query);

  return (
    <>
      <PanelGroup
        autoSaveId="transforms-editor-panel-layout"
        direction="vertical"
        style={{ height: "100%", width: "100%" }}
      >
        <Panel>
          <NewTransformEditorBody
            initialSource={initialSource}
            proposedSource={proposedSource}
            onChange={setSource}
            onSave={handleSave}
            onCancel={handleCancel}
            onRejectProposed={clearProposed}
            onAcceptProposed={handleAcceptProposed}
            queryEditor={queryEditor}
          />
        </Panel>
        <ResizeHandle direction="vertical" />
        <Panel minSize={5} style={{ backgroundColor: "transparent" }}>
          <TransformDrawer transform={{ source }} queryEditor={queryEditor} />
        </Panel>
      </PanelGroup>

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
        // TODO: make this calc correct
        isEnabled={isDirty && !isModalOpened}
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
  queryEditor: TransformEditorValue;
}

function NewTransformEditorBody({
  initialSource,
  proposedSource,
  onChange,
  onSave,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
  queryEditor,
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
      queryEditor={queryEditor}
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
