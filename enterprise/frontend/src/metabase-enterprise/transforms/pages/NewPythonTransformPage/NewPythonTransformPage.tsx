import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
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
  const [source, setSource] = useState<PythonTransformSource>(
    DEFAULT_PYTHON_SOURCE,
  );
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

  return (
    <>
      <PythonTransformEditor
        initialSource={DEFAULT_PYTHON_SOURCE}
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      {isModalOpened && (
        <CreateTransformModal
          source={source}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}
