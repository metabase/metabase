import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  getMetabotSuggestedTransform,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import type { PythonTransformSource, Transform } from "metabase-types/api";

import { PythonTransformEditor } from "../../components/PythonTransformEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";
import { CreateTransformModal } from "../NewTransformQueryPage/CreateTransformModal";

const DEFAULT_PYTHON_SOURCE: PythonTransformSource = {
  type: "python",
  "source-database": 1, // Default to first database, will be updated by user
  "source-tables": {}, // Will be populated when user selects tables
  body: `# Write your Python transformation script here
import pandas as pd

def transform():
    """
    Your transformation function.

    Select tables above to add them as function parameters.

    Returns:
        DataFrame to write to the destination table
    """
    # Your transformation logic here
    return pd.DataFrame([{"message": "Hello from Python transform!"}])`,
};

export function NewPythonTransformPage() {
  const suggestedTransform = useSelector(
    getMetabotSuggestedTransform as any,
  ) as ReturnType<typeof getMetabotSuggestedTransform>;

  const suggestedSource =
    suggestedTransform?.source.type === "python"
      ? suggestedTransform?.source
      : undefined;

  const [initialSuggestedSource] = useState(suggestedSource);

  const initialSource = initialSuggestedSource || DEFAULT_PYTHON_SOURCE;

  return <NewPythonTransformPageBody initialSource={initialSource} />;
}

function NewPythonTransformPageBody({
  initialSource,
}: {
  initialSource: PythonTransformSource;
}) {
  const [source, setSource] = useState<PythonTransformSource>(initialSource);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSaveClick = (newSource: PythonTransformSource) => {
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
    suggestedTransform?.source.type === "python"
      ? suggestedTransform?.source
      : undefined;

  const initSource =
    initialSource.body && initialSource.body.trim().length > 0
      ? initialSource
      : (suggestedSource ?? initialSource);

  const proposedSource =
    suggestedSource?.body &&
    initSource.body &&
    suggestedSource.body === initSource.body
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
      <PythonTransformEditor
        initialSource={initSource}
        proposedSource={proposedSource}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={handleSaveClick}
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
