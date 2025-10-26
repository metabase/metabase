import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Transform, TransformSource } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";

import { CreateTransformModal } from "./CreateTransformModal";

type NewTransformPageProps = {
  initialSource: TransformSource;
};

function _NewTransformPage({ initialSource }: NewTransformPageProps) {
  const [name, setName] = useState(t`New transform`);
  const [source, setSource] = useState(initialSource);
  const [isOpened, { open, close }] = useDisclosure();
  const dispatch = useDispatch();

  const handleCreate = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  return (
    <>
      {source.type === "query" && (
        <TransformEditor
          name={name}
          source={source}
          isSaving={false}
          isSourceDirty
          onNameChange={setName}
          onSourceChange={setSource}
          onSave={open}
        />
      )}
      {isOpened && (
        <CreateTransformModal
          name={name}
          source={source}
          onCreate={handleCreate}
          onClose={close}
        />
      )}
    </>
  );
}
