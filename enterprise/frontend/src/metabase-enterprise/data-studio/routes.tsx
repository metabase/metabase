import type { Store } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { IndexRoute, Route } from "react-router";

import * as Urls from "metabase/lib/urls";
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
import { TransformsSectionLayout } from "./app/pages/TransformsSectionLayout";
import { getDataStudioMetadataRoutes } from "./data-model/routes";
import { getDataStudioGlossaryRoutes } from "./glossary/routes";
import { getDataStudioMetricRoutes } from "./metrics/routes";
import { getDataStudioModelingRoutes } from "./modeling/routes";
import { getDataStudioModelRoutes } from "./models/routes";
import { getDataStudioSnippetRoutes } from "./snippets/routes";
import { canAccessDataStudio } from "./utils";

export function getDataStudioRoutes(
  store: Store<State>,
  CanAccessDataStudio: ComponentType,
  CanAccessDataModel: ComponentType,
  CanAccessTransforms: ComponentType,
) {
  return (
    <Route
      component={CanAccessDataStudio}
      onEnter={(_state, replace) => {
        if (!canAccessDataStudio(store.getState())) {
          replace(Urls.unauthorized());
        }
      }}
    >
      <Route path="data-studio" component={DataStudioLayout}>
        <IndexRoute
          onEnter={(_state, replace) => {
            console.log("getIndexPath", getIndexPath(store.getState()));
            replace(getIndexPath(store.getState()));
          }}
        />
        <Route path="data" component={CanAccessDataModel}>
          <Route component={DataSectionLayout}>
            {getDataStudioMetadataRoutes()}
          </Route>
        </Route>
        {PLUGIN_TRANSFORMS.isEnabled && (
          <Route path="transforms" component={CanAccessTransforms}>
            <Route component={TransformsSectionLayout}>
              {PLUGIN_TRANSFORMS.getDataStudioTransformRoutes()}
            </Route>
          </Route>
        )}
        <Route path="modeling" component={ModelingSectionLayout}>
          {getDataStudioModelingRoutes()}
          {getDataStudioModelRoutes()}
          {getDataStudioMetricRoutes()}
          {getDataStudioSnippetRoutes()}
          {getDataStudioGlossaryRoutes()}
        </Route>
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <Route path="dependencies" component={DependenciesSectionLayout}>
            {PLUGIN_DEPENDENCIES.getDataStudioDependencyRoutes()}
          </Route>
        )}
      </Route>
    </Route>
  );
}

function getIndexPath(state: State) {
  console.log("getIndexPath", state);
  if (PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)) {
    console.log("getIndexPath", Urls.dataStudioData());
    return Urls.dataStudioData();
  }
  if (PLUGIN_TRANSFORMS.canAccessTransforms(state)) {
    return Urls.transformList();
  }
  return Urls.dataStudioModeling();
}
