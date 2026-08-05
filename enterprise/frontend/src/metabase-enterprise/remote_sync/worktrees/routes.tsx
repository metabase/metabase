import { TransformsSectionLayout } from "metabase/data-studio/app/pages/TransformsSectionLayout";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { Navigate, Route } from "metabase/router";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "metabase/transforms/pages/NewTransformPage";
import { TransformDependenciesPage } from "metabase/transforms/pages/TransformDependenciesPage";
import { TransformListPage } from "metabase/transforms/pages/TransformListPage";
import { TransformQueryPage } from "metabase/transforms/pages/TransformQueryPage";
import { TransformSettingsPage } from "metabase/transforms/pages/TransformSettingsPage";

import { WorktreeLayout } from "./WorktreeLayout";

export function getDataStudioWorktreeRoutes() {
  return (
    <Route path="worktrees/:worktreeId" element={<WorktreeLayout />}>
      <Route index element={<Navigate to="transforms" replace />} />
      <Route path="transforms" element={<TransformsSectionLayout />}>
        <Route index element={<TransformListPage />} />
        <Route path="new/query" element={<NewQueryTransformPage />} />
        <Route path="new/native" element={<NewNativeTransformPage />} />
        <Route path="new/card/:cardId" element={<NewCardTransformPage />} />
        <Route path=":transformId" element={<TransformQueryPage />} />
        <Route path=":transformId/edit" element={<TransformQueryPage />} />
        <Route
          path=":transformId/settings"
          element={<TransformSettingsPage />}
        />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path=":transformId/dependencies"
            element={<TransformDependenciesPage />}
          >
            <Route
              index
              element={<PLUGIN_DEPENDENCIES.DependencyGraphPage />}
            />
          </Route>
        )}
        {PLUGIN_TRANSFORMS_PYTHON.getPythonLibraryRoutes()}
      </Route>
    </Route>
  );
}
