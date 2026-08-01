import { useMemo } from "react";
import { t } from "ttag";

import {
  useListCollectionsTreeQuery,
  useListTransformsQuery,
} from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { buildTreeData } from "metabase/transforms/pages/TransformListPage/utils";
import { getShouldShowPythonTransformsUpsell } from "metabase/transforms/selectors";
import * as Urls from "metabase/urls";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

type TransformTreeDataOptions = {
  /** The Python library is shared app-wide rather than belonging to a branch. */
  includePythonLibrary?: boolean;
};

/**
 * The transform folders and transforms of a branch, as the rows of the
 * transform tree. A `worktreeId` of `null` is the main app.
 */
export function useTransformTreeData(
  worktreeId: RemoteSyncWorktreeId | null,
  { includePythonLibrary = false }: TransformTreeDataOptions = {},
) {
  const isWorktreeView = worktreeId != null;
  const { transformsDatabases = [], isLoadingDatabases } =
    useTransformPermissions();
  const hasPythonTransformsFeature = useHasTokenFeature("transforms-python");
  const shouldShowPythonTransformsUpsell = useSelector(
    getShouldShowPythonTransformsUpsell,
  );

  const {
    data: collections,
    error: collectionsError,
    isLoading: isLoadingCollections,
  } = useListCollectionsTreeQuery({
    namespace: "transforms",
    "exclude-archived": true,
    ...(isWorktreeView && { "worktree-id": worktreeId }),
  });

  const {
    data: transforms,
    error: transformsError,
    isLoading: isLoadingTransforms,
  } = useListTransformsQuery(
    isWorktreeView ? { "worktree-id": worktreeId } : {},
  );

  const nodes = useMemo(() => {
    const data = buildTreeData(collections, transforms);

    // It will trigger the upsell modal if the feature isn't enabled.
    const shouldShowPythonLibraryRow =
      includePythonLibrary &&
      !isWorktreeView &&
      (hasPythonTransformsFeature || shouldShowPythonTransformsUpsell);

    if (shouldShowPythonLibraryRow) {
      data.push({
        id: "library",
        name: t`Python library`,
        nodeType: "library",
        icon: "snippet",
        url: Urls.transformPythonLibrary({
          path: PLUGIN_TRANSFORMS_PYTHON.sharedLibImportPath,
        }),
        can_read: transformsDatabases.length > 0,
      });
    }
    return data;
  }, [
    collections,
    hasPythonTransformsFeature,
    includePythonLibrary,
    isWorktreeView,
    shouldShowPythonTransformsUpsell,
    transforms,
    transformsDatabases.length,
  ]);

  return {
    nodes,
    transforms,
    isLoading:
      isLoadingCollections || isLoadingTransforms || isLoadingDatabases,
    error: collectionsError ?? transformsError,
  };
}
