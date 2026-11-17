import type { ComponentType } from "react";

import { lazyModalRouteElement } from "metabase/common/components/ModalRoute";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { loadActionCreator } from "metabase/querying/action-creator";
import { Route, redirect } from "metabase/router";

// The action editor is a separate chunk. The loader awaits it so the modal only
// opens once the editor is ready, instead of opening around a loading state.
const actionCreatorModal = () =>
  Promise.all([
    import(
      /* webpackChunkName: "action-creator-modal" */ "./containers/ActionCreatorModal/ActionCreatorModal"
    ),
    loadActionCreator(),
  ]).then(([{ default: ActionCreatorModal }]) => ActionCreatorModal);

const modelDetailPage = () =>
  import(
    /* webpackChunkName: "model-detail" */ "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage"
  ).then(({ ModelDetailPage }) => ({ Component: ModelDetailPage }));

export const getRoutes = (IsAdmin: ComponentType) => (
  <Route path="/model/:slug/detail">
    <Route path="actions" element={<ModelActions />}>
      <Route element={<IsAdmin />}>
        {lazyModalRouteElement("new", actionCreatorModal)}
      </Route>
      {lazyModalRouteElement(":actionId", actionCreatorModal)}
    </Route>
    <Route path=":rowId" lazy={modelDetailPage} />
    <Route index element={redirect("actions")} />
    <Route path="usage" element={redirect("../actions")} />
    <Route path="schema" element={redirect("../actions")} />
    <Route path="*" element={redirect("../actions")} />
  </Route>
);
