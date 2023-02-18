import React from "react";
import type { WritebackAction } from "metabase-types/api";

import ImplicitActionContextProvider, {
  ImplicitActionContextProviderProps,
} from "./ImplicitActionContextProvider";
import QueryActionContextProvider, {
  QueryActionContextProviderProps,
} from "./QueryActionContextProvider";

type Props = Omit<ImplicitActionContextProviderProps, "initialAction"> &
  Omit<QueryActionContextProviderProps, "initialAction"> & {
    initialAction?: WritebackAction;
  };

function ActionContextProvider({ initialAction, ...props }: Props) {
  if (initialAction?.type === "query") {
    return (
      <QueryActionContextProvider {...props} initialAction={initialAction} />
    );
  }

  if (initialAction?.type === "implicit") {
    return (
      <ImplicitActionContextProvider {...props} initialAction={initialAction} />
    );
  }

  // Fallback to "new query action" mode when the action type is not supported
  return <QueryActionContextProvider {...props} />;
}

export default ActionContextProvider;
