import React from "react";
import { IndexRoute } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";

import StoreActivate from "./containers/StoreActivate";
import StoreAccount from "./containers/StoreAccount";

export default function getRoutes() {
  return (
    <Route path="store" title={t`Store`}>
      <IndexRoute component={StoreAccount} />
      <Route path="activate" component={StoreActivate} />
    </Route>
  );
}
