import { useMemo } from "react";
import { match } from "ts-pattern";

import type { TransformHost } from "metabase/transforms/host";
import * as Urls from "metabase/urls";

import { useContentStudioScope } from "./scope";

/** Routes the shared transform pages at Content Studio's own URLs. */
export function useContentStudioTransformHost(): TransformHost {
  const { worktreeId } = useContentStudioScope();

  return useMemo<TransformHost>(() => {
    const scope = worktreeId != null ? { worktreeId } : {};

    return {
      worktreeId,
      rootUrl: Urls.contentStudioTransforms(scope),
      getTransformUrl: Urls.contentStudioTransform,
      getTransformEditUrl: Urls.contentStudioTransformEdit,
      getTransformRunUrl: Urls.contentStudioTransformRun,
      getTransformSettingsUrl: Urls.contentStudioTransformSettings,
      getTransformIndexesUrl: Urls.contentStudioTransformIndexes,
      // Inspection, dependencies and run history are not hosted in Content Studio.
      getTransformInspectUrl: null,
      getTransformDependenciesUrl: null,
      getTransformRunListUrl: null,
      getNewTransformUrl: (sourceType) =>
        match(sourceType)
          .with("query", () => Urls.contentStudioNewQueryTransform(scope))
          .with("native", () => Urls.contentStudioNewNativeTransform(scope))
          // The Python editor lives in Data Studio, along with the shared library it draws on.
          .with("python", () => Urls.newPythonTransform(scope))
          .exhaustive(),
      getNewTransformFromCardUrl: (cardId) =>
        Urls.contentStudioNewTransformFromCard(cardId, scope),
      // Folders are browsed from the sidebar tree, so breadcrumbs only name them.
      getFolderUrl: null,
      hasHostChrome: true,
    };
  }, [worktreeId]);
}
