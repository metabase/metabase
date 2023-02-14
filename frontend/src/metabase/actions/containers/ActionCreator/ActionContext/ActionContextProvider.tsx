import React from "react";
import QueryActionContextProvider, {
  QueryActionContextProviderProps,
} from "./QueryActionContextProvider";

type Props = QueryActionContextProviderProps;

function ActionContextProvider(props: Props) {
  return <QueryActionContextProvider {...props} />;
}

export default ActionContextProvider;
