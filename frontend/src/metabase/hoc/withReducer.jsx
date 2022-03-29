import React, { useContext } from "react";
import { StoreContext } from "../store";

export const withReducer = (key, reducer) => Component => {
  const ComponentWithReducer = props => {
    const store = useContext(StoreContext);
    store.injectReducer(key, reducer);

    return <Component {...props} />;
  };

  ComponentWithReducer.displayName = `ComponentWithReducer(${Component.displayName ??
    Component.name})`;

  return ComponentWithReducer;
};
