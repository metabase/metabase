import { IndexRedirect, Redirect, Route } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
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
        <ModalRoute
          path="new"
          modal={ActionCreatorModal}
          modalProps={modalProps}
        />
        <ModalRoute
          path=":actionId"
          modal={ActionCreatorModal}
          modalProps={modalProps}
        />
      </Route>
      <Route path=":rowId" component={ModelDetailPage} />
      <IndexRedirect to="actions" />
      <Redirect from="usage" to="actions" />
      <Redirect from="schema" to="actions" />
      <Redirect from="*" to="actions" />
    </Route>
  );
};
