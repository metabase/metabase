import { useEffect } from "react";

import { useNavigate } from "metabase/router";

import type { Principal } from "../api";

import {
  type PreviewTab,
  getLastPrincipal,
  getPreviewUrl,
  setLastPrincipal,
} from "./urls";

/**
 * Keeps who is previewed across tabs: remembers the principal shown, and opens a tab's bare Preview on the last one.
 */
export function useRememberPrincipal(
  tab: PreviewTab,
  principal: Principal | null,
  isBarePreview: boolean,
) {
  const navigate = useNavigate();
  const type = principal?.type;
  const id = principal?.id;

  useEffect(() => {
    if (type != null && id != null) {
      setLastPrincipal({ type, id });
      return;
    }
    const lastPrincipal = getLastPrincipal();
    if (isBarePreview && lastPrincipal) {
      navigate(getPreviewUrl(tab, lastPrincipal), { replace: true });
    }
  }, [tab, type, id, isBarePreview, navigate]);
}
