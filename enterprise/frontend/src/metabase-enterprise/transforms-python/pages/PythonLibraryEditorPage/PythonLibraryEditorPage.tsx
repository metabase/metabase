import { useLayoutEffect, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { isResourceNotFoundError } from "metabase/lib/errors";
import type * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Card } from "metabase/ui";
import {
  useGetPythonLibraryQuery,
  useUpdatePythonLibraryMutation,
} from "metabase-enterprise/api/python-transform-library";

import { PythonEditor } from "../../components/PythonEditor";

import { PythonLibraryEditorHeader } from "./PythonLibraryEditorHeader";
import S from "./PythonLibraryEditorPage.module.css";

type PythonLibraryEditorPageProps = {
  params: Urls.TransformPythonLibraryParams;
  route: Route;
};

const EMPTY_LIBRARY_SOURCE = `
# This is your Python library.
# You can add functions and classes here that can be reused in Python transforms.
`
  .trim()
  .concat("\n");

export function PythonLibraryEditorPage({
  params,
  route,
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

    if (isResourceNotFoundError(error)) {
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
  useLayoutEffect(() => {
    if (library != null) {
      setSource(library.source);
    }
  }, [library]);

  const isDirty = source !== (library?.source ?? EMPTY_LIBRARY_SOURCE);

  if (isLoading || (error && !isResourceNotFoundError(error))) {
    return (
      <Box p="md">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Box>
    );
  }

  return (
    <>
      <PageContainer>
        <PythonLibraryEditorHeader
          onSave={handleSave}
          onRevert={handleRevert}
          isDirty={isDirty}
          isSaving={isSaving}
        />

        <Card withBorder p={0}>
          <PythonEditor
            value={source}
            onChange={setSource}
            withPandasCompletions
            className={S.editor}
            data-testid="python-editor"
          />
        </Card>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
  );
}
