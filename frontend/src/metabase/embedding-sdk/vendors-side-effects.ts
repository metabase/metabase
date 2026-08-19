import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "metabase/css/index.module.css";

// The SDK bundle reads the CSP nonce through get-nonce, so it is set here.
// Otherwise it depends on which component happens to import metabase/utils/csp.
import "metabase/utils/csp";
import "metabase/utils/dayjs";
