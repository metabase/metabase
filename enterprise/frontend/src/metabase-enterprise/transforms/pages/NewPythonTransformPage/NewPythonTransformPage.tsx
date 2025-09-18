import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { PythonTransformSource, Transform } from "metabase-types/api";

import { PythonTransformEditor } from "../../components/PythonTransformEditor";
import { getTransformListUrl, getTransformUrl } from "../../urls";
import { CreateTransformModal } from "../NewTransformQueryPage/CreateTransformModal";

export function NewPythonTransformPage() {
  const [source, setSource] = useState<PythonTransformSource | null>(null);
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
        isNew
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      {isModalOpened && source && (
        <CreateTransformModal
          source={source}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
    </>
  );
}
