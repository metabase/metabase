import { useContext } from "react";

import { ShadowRootContext } from "metabase/embedding-sdk/components";

export function useRootElement() {
  return useContext(ShadowRootContext).rootElement ?? document.body;
}
