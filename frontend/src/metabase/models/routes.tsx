import { modalRoute } from "metabase/common/components/ModalRoute";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { Route, redirect } from "metabase/router";
import {
  type ModalProps,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";

import ActionCreatorModal from "./containers/ActionCreatorModal/ActionCreatorModal";

/**
 * The action pages stay eager: `modalRoute` takes a component rather than a
 * loader, so deferring them needs more than a route change.
 */
const modelDetailPage = () =>
  import(
    /* webpackChunkName: "model-detail" */ "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage"
  ).then(({ ModelDetailPage }) => ({ Component: ModelDetailPage }));

export const getRoutes = () => {
  const modalProps: Partial<ModalProps> = {
    ...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
    size: "95%",
  };
  return (
    <Route path="/model/:slug/detail">
      <Route path="actions" element={<ModelActions />}>
        {modalRoute("new", ActionCreatorModal, { modalProps })}
        {modalRoute(":actionId", ActionCreatorModal, { modalProps })}
      </Route>
      <Route path=":rowId" lazy={modelDetailPage} />
      <Route index element={redirect("actions")} />
      <Route path="usage" element={redirect("../actions")} />
      <Route path="schema" element={redirect("../actions")} />
      <Route path="*" element={redirect("../actions")} />
    </Route>
  );
};
