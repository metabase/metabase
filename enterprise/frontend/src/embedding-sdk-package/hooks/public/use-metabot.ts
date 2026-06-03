import { useSyncExternalStore } from "react";

import type { UseMetabotResult } from "embedding-sdk-bundle/types/metabot";
import {
  getMetabotStateSnapshot,
  subscribeMetabotState,
} from "embedding-sdk-shared/lib/metabot-state-channel";

const getServerSnapshot = (): UseMetabotResult | null => null;

/**
 * Returns the Metabot conversation API.
 *
 * Returns `null` until the SDK bundle has loaded and `<MetabaseProvider>`
 * has mounted its internal subscriber. Guard before use:
 *
 * @example
 * const metabot = useMetabot();
 * if (!metabot) {
 *   return <Spinner />;
 * }
 * metabot.submitMessage("Show me orders");
 *
 * @function
 * @category useMetabot
 */
export const useMetabot = (): UseMetabotResult | null =>
  useSyncExternalStore(
    subscribeMetabotState,
    getMetabotStateSnapshot,
    getServerSnapshot,
  );
