import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "metabase/css/index.module.css";

// The SDK bundle reads the CSP nonce through get-nonce, so it is set here.
// Otherwise nothing in the bundle sets it.
import "metabase/utils/csp-setup";
