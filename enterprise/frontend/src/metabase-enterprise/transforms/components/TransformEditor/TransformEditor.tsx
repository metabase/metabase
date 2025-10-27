import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import {
  QueryEditor,
  type QueryEditorUiControls,
} from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Center, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { QueryTransformSource, TransformId } from "metabase-types/api";

import { TransformHeaderView } from "../TransformHeader";

import { EditorActions } from "./EditorActions";
import { shouldDisableDatabase, shouldDisableItem } from "./utils";

type TransformEditorProps = {
  id?: TransformId;
  name: string;
  source: QueryTransformSource;
  uiControls: QueryEditorUiControls;
  isSaving: boolean;
  isSourceDirty: boolean;
  onNameChange: (newName: string) => void;
  onSourceChange: (newSource: QueryTransformSource) => void;
  onUiControlsChange: (newUiControls: QueryEditorUiControls) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformEditor({
  id,
  name,
  source,
  uiControls,
  isSaving,
  isSourceDirty,
  onNameChange,
  onSourceChange,
  onUiControlsChange,
  onSave,
  onCancel,
}: TransformEditorProps) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(() => {
    const metadataProvider = Lib.metadataProvider(
      source.query.database,
      metadata,
    );
    return Lib.fromJsQuery(metadataProvider, source.query);
  }, [source, metadata]);

  const { data, isLoading, error } = useListDatabasesQuery({
    include_analytics: true,
  });
  const databases = data?.data ?? [];

  const handleQueryChange = (newQuery: Lib.Query) => {
    onSourceChange({ type: "query", query: Lib.toJsQuery(newQuery) });
  };

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%">
      <TransformHeaderView
        id={id}
        name={name}
        actions={
          (isSaving || isSourceDirty) && (
            <EditorActions
              query={query}
              isSaving={isSaving}
              onSave={onSave}
              onCancel={onCancel}
            />
          )
        }
        onNameChange={onNameChange}
      />
      <QueryEditor
        query={query}
        type="question"
        uiControls={uiControls}
        convertToNativeTitle={t`SQL for this transform`}
        convertToNativeButtonLabel={t`Convert this transform to SQL`}
        shouldDisableItem={(item) => shouldDisableItem(item, databases)}
        shouldDisableDatabase={({ id }) => shouldDisableDatabase(id, databases)}
        onQueryChange={handleQueryChange}
        onUiControlsChange={onUiControlsChange}
      />
    </Flex>
  );
}
