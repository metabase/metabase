import { IndexRedirect, Redirect } from "react-router";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";

export const getRoutes = () => (
  <Route path="/model/:slug/detail">
    <IndexRedirect to="usage" />
    <Route path="usage" component={ModelActions} />
    <Route path="schema" component={ModelActions} />
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
    <Redirect from="*" to="usage" />
  </Route>
);
