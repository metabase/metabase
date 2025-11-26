import { IndexRedirect, Redirect, Route } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";

export const getRoutes = () => (
  <Route path="/model/:slug/detail">
    <Route path="actions" component={ModelActions}>
      <ModalRoute
        path="new"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          closeOnClickOutside: false, // logic in component is reversed, so false is true.
        }}
      />
      <ModalRoute
        path=":actionId"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          closeOnClickOutside: false, // logic in component is reversed, so false is true.
        }}
      />
    </Route>
    <Route path=":rowId" component={ModelDetailPage} />
    <IndexRedirect to="actions" />
    <Redirect from="usage" to="actions" />
    <Redirect from="schema" to="actions" />
    <Redirect from="*" to="actions" />
  </Route>
);
