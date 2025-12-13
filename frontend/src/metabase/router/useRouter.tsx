import { useContext } from "react";
import type { Params } from "react-router/lib/Router";

import type { RouterContextType } from "./RouterProvider";
import { RouterContext } from "./RouterProvider";

export const useRouter = <
  TParams extends Params = Params,
>(): RouterContextType<TParams> => {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used inside <RouterProvider>");
  }
  return ctx as RouterContextType<TParams>;
};
