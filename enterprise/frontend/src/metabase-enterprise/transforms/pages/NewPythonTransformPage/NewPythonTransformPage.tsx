import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { Transform, TransformSource } from "metabase-types/api";

import { PythonTransformEditor } from "../../components/PythonTransformEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";

import { CreatePythonTransformModal } from "./CreatePythonTransformModal";

const DEFAULT_PYTHON_SOURCE: TransformSource & { type: "python" } = {
  type: "python",
  "source-database": 1, // Default to first database, will be updated by user
  body: `# Write your Python transformation script here
import pandas as pd

def transform(table_name):
    """
    Your transformation function.

    Args:
        table_name: DataFrame corresponding to the source table with the matching alias

        (rename to match your actual alias, add extra arguments named for each additional table)

    Returns:
        DataFrame to write to the destination table
    """
    # Your transformation logic here
    return pd.DataFrame([{"row_count": table_name.size}])`,
};

export function NewPythonTransformPage() {
  const [source, setSource] = useState<TransformSource & { type: "python" }>(
    DEFAULT_PYTHON_SOURCE,
  );
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  const handleSaveClick = (newSource: TransformSource & { type: "python" }) => {
    setSource(newSource);
    openModal();
  };

  const handleCancelClick = () => {
    dispatch(push(getTransformListUrl()));
  };

  return (
    <>
      <PythonTransformEditor
        initialSource={DEFAULT_PYTHON_SOURCE}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      {isModalOpened && (
        <CreatePythonTransformModal
          source={source}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}
