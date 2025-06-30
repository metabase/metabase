import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Mantine styles need to be imported before any of our components so that our styles win over
// the default mantine styles
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "metabase/lib/dayjs";

// Import the EE plugins required by the embedding sdk.
import "sdk-ee-plugins";

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";

// Components
export * from "./components/public";

// Exports needed for public Hooks that use sdk redux store
export { getSdkStore } from "./store/index";
export { getApplicationName } from "metabase/selectors/whitelabel";
export { getSetting } from "metabase/selectors/settings";
export { getUser } from "metabase/selectors/user";
export { getLoginStatus } from "embedding-sdk/store/selectors";
