import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { IndexRedirect, Redirect, Route } from "metabase/router";
import {
  type ModalProps,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";

export const getRoutes = () => {
  const modalProps: Partial<ModalProps> = {
    ...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
    size: "95%",
  };
  return (
    <Route path="/model/:slug/detail">
      <Route path="actions" component={ModelActions}>
        {modalRoute("new", ActionCreatorModal, { modalProps })}
        {modalRoute(":actionId", ActionCreatorModal, { modalProps })}
      </Route>
      <Route path=":rowId" component={ModelDetailPage} />
      <IndexRedirect to="actions" />
      <Redirect from="usage" to="actions" />
      <Redirect from="schema" to="actions" />
      <Redirect from="*" to="actions" />
    </Route>
  );
};
