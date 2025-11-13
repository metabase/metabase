import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute } from "react-router";
import { t } from "ttag";

import { ModelingCollectionView } from "metabase/data-studio/app/pages/ModelingSectionLayout/ModelingCollectionView";
import { ModelingEmptyPage } from "metabase/data-studio/app/pages/ModelingSectionLayout/ModelingEmptyPage";
import { ModelingGlossary } from "metabase/data-studio/app/pages/ModelingSectionLayout/ModelingGlossary";
import {
  EditSnippetPage,
  NewSnippetPage,
  SnippetDependenciesPage,
} from "metabase/data-studio/app/pages/ModelingSectionLayout/SnippetEditorPage";
import { getDataStudioMetricRoutes } from "metabase/data-studio/metrics/routes";
import { getDataStudioModelRoutes } from "metabase/data-studio/models/routes";
import { Route } from "metabase/hoc/Title";
import * as Urls from "metabase/lib/urls";
import { getDataStudioMetadataRoutes } from "metabase/metadata/routes";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import type { State } from "metabase-types/store";

import { DataSectionLayout } from "./pages/DataSectionLayout";
import { DataStudioLayout } from "./pages/DataStudioLayout";
import { DependenciesSectionLayout } from "./pages/DependenciesSectionLayout";
import { ModelingSectionLayout } from "./pages/ModelingSectionLayout";
import { TransformsSectionLayout } from "./pages/TransformsSectionLayout";

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
        <Route
          path="collections/:collectionId"
          component={ModelingCollectionView}
        />
        <Route path="glossary" component={ModelingGlossary} />
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
        {getDataStudioModelRoutes()}
        {getDataStudioMetricRoutes()}
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
