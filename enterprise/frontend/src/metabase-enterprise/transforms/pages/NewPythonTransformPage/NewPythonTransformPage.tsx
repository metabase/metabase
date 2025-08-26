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

def transform(data):
    """
    Your transformation function.

    Args:
        data: Input data (to be defined based on implementation)

    Returns:
        Transformed data
    """
    # Your transformation logic here
    return data

# Example usage:
# result = transform(input_data)`,
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
