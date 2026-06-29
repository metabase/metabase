// The PLUGIN_NOTIFICATIONS_SDK slot moved to metabase/plugins/oss so the OSS
// dashboard can read it without importing from the app-tier SDK bundle.
// Re-exported here so existing bundle/EE imports keep working.
export * from "metabase/plugins/oss/notifications-sdk";
