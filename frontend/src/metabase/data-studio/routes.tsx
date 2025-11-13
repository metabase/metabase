import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";
import { getDataStudioMetadataRoutes } from "metabase/metadata/routes";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./app/pages/DataSectionLayout";
import { DataStudioLayout } from "./app/pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./app/pages/DependenciesSectionLayout";
import { ModelingSectionLayout } from "./app/pages/ModelingSectionLayout";
import {
  EditSnippetPage,
  NewSnippetPage,
  SnippetDependenciesPage,
} from "./app/pages/ModelingSectionLayout/SnippetEditorPage";
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { ModelingEmptyPage } from "./modeling/pages/ModelingEmptyPage";
import { getDataStudioModelingRoutes } from "./modeling/routes";
import { getDataStudioModelRoutes } from "./models/routes";

export function getDataStudioRoutes(
  store: Store<State>,
  CanAccessDataModel: ComponentType,
  CanAccessTransforms: ComponentType,
) {
  return (
    <Route component={DataStudioLayout}>
      <IndexRoute
        onEnter={(_state, replace) => {
          replace(getIndexPath(store.getState()));
        }}
      />
      <Route path="data" component={CanAccessDataModel}>
        <Route title={t`Data`} component={DataSectionLayout}>
          {getDataStudioMetadataRoutes()}
        </Route>
      </Route>
      {PLUGIN_TRANSFORMS.isEnabled && (
        <Route path="transforms" component={CanAccessTransforms}>
          <Route title={t`Transforms`} component={TransformsSectionLayout}>
            {PLUGIN_TRANSFORMS.getDataStudioTransformRoutes()}
          </Route>
        </Route>
      )}
      <Route
        title={t`Modeling`}
        path="modeling"
        component={ModelingSectionLayout}
      >
        <IndexRoute component={ModelingEmptyPage} />
        <Route path="snippets/new" component={NewSnippetPage} />
        <Route path="snippets/:snippetId" component={EditSnippetPage} />
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route
            path="snippets/:snippetId/dependencies"
            component={SnippetDependenciesPage}
          >
            <IndexRoute component={PLUGIN_DEPENDENCIES.DependencyGraphPage} />
          </Route>
        )}
        {getDataStudioModelingRoutes()}
        {getDataStudioModelRoutes()}
        {getDataStudioMetricRoutes()}
        {getDataStudioGlossaryRoutes()}
      </Route>
      {PLUGIN_DEPENDENCIES.isEnabled && (
        <Route
          title={t`Dependency graph`}
          path="dependencies"
          component={DependenciesSectionLayout}
        >
          {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
        </Route>
      )}
    </Route>
  );
}

function getIndexPath(state: State) {
  if (PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)) {
    return Urls.dataStudioData();
  }
  if (PLUGIN_TRANSFORMS.canAccessTransforms(state)) {
    return Urls.transformList();
  }
  return Urls.dataStudioModeling();
}
