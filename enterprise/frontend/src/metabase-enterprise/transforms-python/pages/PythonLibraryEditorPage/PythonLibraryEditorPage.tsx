import { useLayoutEffect, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import Link from "metabase/common/components/Link/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { isResourceNotFoundError } from "metabase/lib/errors";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Flex, Group } from "metabase/ui";
import {
  useGetPythonLibraryQuery,
  useUpdatePythonLibraryMutation,
} from "metabase-enterprise/api/python-transform-library";
import { TransformsSectionHeader } from "metabase-enterprise/data-studio/app/pages/TransformsSectionLayout/TransformsSectionHeader";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

import { PythonEditor } from "../../components/PythonEditor";

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
      <Flex h="100%" w="100%" gap={0} direction="column">
        <TransformsSectionHeader
          leftSection={
            <DataStudioBreadcrumbs>
              <Link to={Urls.transformList()}>{t`Transforms`}</Link>
              {t`Python library`}
            </DataStudioBreadcrumbs>
          }
        />
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
          data-testid="python-editor"
        />
      </Flex>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
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
    <PaneHeader
      pt={0}
      title={<PanelHeaderTitle>{t`Python library`}</PanelHeaderTitle>}
      actions={
        (isDirty || isSaving) && (
          <Group>
            <Button disabled={isSaving} onClick={onRevert}>
              {t`Revert`}
            </Button>
            <Button variant="filled" disabled={isSaving} onClick={onSave}>
              {t`Save`}
            </Button>
          </Group>
        )
      }
      data-testid="python-library-header"
    />
  );
}
