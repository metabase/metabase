import { useEffect, useState } from "react";
import { t } from "ttag";

import Button from "metabase/common/components/Button";
import EditBar from "metabase/common/components/EditBar";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Flex } from "metabase/ui";
import {
  useGetPythonLibraryQuery,
  useUpdatePythonLibraryMutation,
} from "metabase-enterprise/api/python-transform-library";
import { PythonEditor } from "metabase-enterprise/transforms/components/PythonEditor";
import type { PythonLibraryEditorPageParams } from "metabase-enterprise/transforms/types";

import S from "./PythonLibraryEditorPage.module.css";
import { isNotFoundError } from "./utils";

type PythonLibraryEditorPageProps = {
  params: PythonLibraryEditorPageParams;
};

const EMPTY_LIBRARY_SOURCE = `
# This is your Python library.
# You can add functions and classes here that can be reused in Python transforms.
`
  .trim()
  .concat("\n");

export function PythonLibraryEditorPage({
  params,
}: PythonLibraryEditorPageProps) {
  const { path } = params;
  const [source, setSource] = useState("");

  const {
    data: library,
    isLoading,
    error,
  } = useGetPythonLibraryQuery({ path });
  const [updatePythonLibrary, { isLoading: isSaving }] =
    useUpdatePythonLibraryMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  function handleRevert() {
    if (isLoading) {
      return;
    }

    if (isNotFoundError(error)) {
      setSource(EMPTY_LIBRARY_SOURCE);
      return;
    }

    if (library != null) {
      setSource(library.source || "");
    }
  }

  async function handleSave() {
    try {
      await updatePythonLibrary({ path, source }).unwrap();
      sendSuccessToast(t`Python library saved`);
    } catch (error) {
      sendErrorToast(t`Python library could not be saved`);
    }
  }

  // When the library loads, set the source to the current library source
  useEffect(handleRevert, [isLoading, error, library]);

  const isDirty = source !== library?.source;

  if (isLoading || (error && !isNotFoundError(error))) {
    return (
      <Box p="md">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Box>
    );
  }

  return (
    <Flex h="100%" w="100%" bg="bg-light" gap={0} direction="column">
      <LibraryEditorHeader
        onSave={handleSave}
        onRevert={handleRevert}
        isDirty={isDirty}
        isSaving={isSaving}
      />
      <PythonEditor
        value={source}
        onChange={setSource}
        withPandasCompletions
        className={S.editor}
      />
    </Flex>
  );
}

export function LibraryEditorHeader({
  isDirty,
  isSaving,
  onSave,
  onRevert,
}: {
  isDirty?: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  return (
    <EditBar
      title={t`You are editing the shared Python library`}
      admin
      buttons={[
        <Button
          key="save"
          onClick={onRevert}
          primary
          small
          disabled={!isDirty || isSaving}
        >
          {t`Revert`}
        </Button>,
        <Button
          key="save"
          onClick={onSave}
          primary
          small
          disabled={!isDirty || isSaving}
        >
          {t`Save`}
        </Button>,
      ]}
    />
  );
}
