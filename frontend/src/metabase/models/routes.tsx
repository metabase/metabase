import React from "react";
import { IndexRedirect, Redirect } from "react-router";
import { Route } from "metabase/hoc/Title";
import ModelDetailPage from "metabase/models/containers/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";

export const getRoutes = () => (
  <Route path="/model/:slug/detail">
    <IndexRedirect to="usage" />
    <Route path="usage" component={ModelDetailPage} />
    <Route path="schema" component={ModelDetailPage} />
    <Route path="actions" component={ModelDetailPage}>
      <ModalRoute
        path="new"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          noOnClickOutsideWrapper: true,
        }}
      />
      <ModalRoute
        path=":actionId"
        modal={ActionCreatorModal}
        modalProps={{
          wide: true,
          enableTransition: false,
          noOnClickOutsideWrapper: true,
        }}
      />
    </Route>
    <Redirect from="*" to="usage" />
  </Route>
);
