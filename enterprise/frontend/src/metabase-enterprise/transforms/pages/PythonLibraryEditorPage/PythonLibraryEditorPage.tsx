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

type PythonLibraryEditorPageProps = {
  params: PythonLibraryEditorPageParams;
};

export function PythonLibraryEditorPage({
  params,
}: PythonLibraryEditorPageProps) {
  const { name } = params;
  const [source, setSource] = useState("");

  const {
    data: library,
    isLoading,
    error,
  } = useGetPythonLibraryQuery({ name });
  const [updatePythonLibrary, { isLoading: isSaving }] =
    useUpdatePythonLibraryMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  useEffect(() => {
    setSource(library?.source || "");
  }, [library?.source]);

  const isDirty = source !== library?.source;

  function handleRevert() {
    setSource(library?.source || "");
  }

  async function handleSave() {
    try {
      await updatePythonLibrary({ name, source }).unwrap();
      sendSuccessToast(t`Python library saved`);
    } catch (error) {
      sendErrorToast(t`Python library could not be saved`);
    }
  }

  if (isLoading || error) {
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
