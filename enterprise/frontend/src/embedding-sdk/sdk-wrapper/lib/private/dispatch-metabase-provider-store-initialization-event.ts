import { METABASE_PROVIDER_STORE_INITIALIZATION_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { MetabaseProviderStoreInitializationEvent } from "embedding-sdk/sdk-wrapper/types/sdk-store";

export function dispatchMetabaseProviderStoreInitializationEvent(
  status: MetabaseProviderStoreInitializationEvent["status"],
) {
  const event = new CustomEvent<MetabaseProviderStoreInitializationEvent>(
    METABASE_PROVIDER_STORE_INITIALIZATION_EVENT_NAME,
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
