import { METABASE_PROVIDER_PROPS_STORE_INIT_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { MetabaseProviderPropsStoreInitEvent } from "embedding-sdk/sdk-wrapper/types/sdk-store";

export function dispatchMetabaseProviderPropsStoreInitEvent(
  status: MetabaseProviderPropsStoreInitEvent["status"],
) {
  const event = new CustomEvent<MetabaseProviderPropsStoreInitEvent>(
    METABASE_PROVIDER_PROPS_STORE_INIT_EVENT_NAME,
    {
      bubbles: true,
      composed: true,
      detail: {
        status,
      },
    },
  );

  document.dispatchEvent(event);
}
