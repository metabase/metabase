import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

import "metabase/lib/dayjs";

// Import the EE plugins required by the embedding sdk.
import "sdk-ee-plugins";

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";
