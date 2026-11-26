import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
// Loaded up front so skullet doesn't inject it at runtime, which the CSP's style-src nonce would block
import "skullet/styles.css";
import "metabase/css/index.module.css";
// The SDK bundle reads the CSP nonce through get-nonce, so it is set here.
// Otherwise nothing in the bundle sets it.
import "metabase/utils/csp-setup";
