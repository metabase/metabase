import { useContext } from "react";

import { ShadowRootContext } from "metabase/embedding-sdk/components";

export function useRootElement() {
  // eslint-disable-next-line no-direct-document-references
  return useContext(ShadowRootContext).rootElement ?? document.body;
}
