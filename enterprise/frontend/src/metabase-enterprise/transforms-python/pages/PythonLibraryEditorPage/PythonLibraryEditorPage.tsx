import { useLayoutEffect, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { isResourceNotFoundError } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import type * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Alert, Box, Card, Stack } from "metabase/ui";
import {
  useGetPythonLibraryQuery,
  useUpdatePythonLibraryMutation,
} from "metabase-enterprise/api/python-transform-library";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import {
  ADVANCED_TRANSFORM_TYPES,
  type AdvancedTransformType,
} from "metabase-types/api";

import { PythonEditor } from "../../components/PythonEditor";

import { PythonLibraryEditorHeader } from "./PythonLibraryEditorHeader";
import S from "./PythonLibraryEditorPage.module.css";

type PythonLibraryEditorPageProps = {
  params: Urls.TransformPythonLibraryParams;
  route: Route;
};

function getTypeFromPath(path: string): AdvancedTransformType | undefined {
  if (path.endsWith(".py")) {
    return "python";
  }
  if (path.endsWith(".js")) {
    return "javascript";
  }
}

function getEmptyLibrarySource(type?: AdvancedTransformType) {
  if (type == null) {
    return "";
  }
  const { displayName, commentString } = ADVANCED_TRANSFORM_TYPES[type];
  return `
${commentString} This is your ${displayName} library.
${commentString} You can add code here that can be reused in ${displayName} transforms.
`
    .trim()
    .concat("\n");
}

export function PythonLibraryEditorPage({
  params,
  route,
}: PythonLibraryEditorPageProps) {
  const { path } = params;
  const type = getTypeFromPath(path);
  const emptyLibrarySource = getEmptyLibrarySource(type);
  const [source, setSource] = useState(emptyLibrarySource);
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const {
    data: library,
    isLoading,
    error,
  } = useGetPythonLibraryQuery(type != null ? { path, type } : skipToken);
  const [updatePythonLibrary, { isLoading: isSaving }] =
    useUpdatePythonLibraryMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  function handleRevert() {
    if (isLoading) {
      return;
    }

    if (isResourceNotFoundError(error)) {
      setSource(emptyLibrarySource);
      return;
    }

    if (library != null) {
      setSource(library.source || "");
    }
  }

  async function handleSave() {
    if (type == null) {
      return;
    }
    try {
      await updatePythonLibrary({ path, source, type }).unwrap();
      sendSuccessToast(t`Library saved`);
    } catch (error) {
      sendErrorToast(t`Library could not be saved`);
    }
  }

  // When the library loads, set the source to the current library source
  useLayoutEffect(() => {
    if (library?.source) {
      setSource(library.source);
    } else {
      setSource(emptyLibrarySource);
    }
  }, [library, emptyLibrarySource]);

  const isDirty = source !== (library?.source || emptyLibrarySource);

  if (isLoading || (error && !isResourceNotFoundError(error)) || type == null) {
    return (
      <Box p="md">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Box>
    );
  }

  const typeDisplayName = ADVANCED_TRANSFORM_TYPES[type].displayName;

  return (
    <>
      <PageContainer>
        <Stack>
          <PythonLibraryEditorHeader
            typeDisplayName={typeDisplayName}
            onSave={handleSave}
            onRevert={handleRevert}
            isDirty={isDirty && !isRemoteSyncReadOnly}
            isSaving={isSaving}
          />

          {isRemoteSyncReadOnly && (
            <Alert
              className={S.flexStart}
              color="warning"
              p="0.75rem"
              title={t`The library is not editable because Remote Sync is in read-only mode.`}
              variant="outline"
              w="auto"
            />
          )}
        </Stack>

        <Card withBorder p={0}>
          <PythonEditor
            type={type}
            value={source}
            onChange={setSource}
            className={S.editor}
            data-testid="python-editor"
            readOnly={isRemoteSyncReadOnly}
          />
        </Card>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
  );
}
