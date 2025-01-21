import { IndexRedirect, Redirect } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
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
          closeOnClickOutside: true,
        }}
      />
      <ModalRoute
        path=":actionId"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          closeOnClickOutside: true,
        }}
      />
    </Route>
    <IndexRedirect to="actions" />
    <Redirect from="usage" to="actions" />
    <Redirect from="schema" to="actions" />
    <Redirect from="*" to="actions" />
  </Route>
);
