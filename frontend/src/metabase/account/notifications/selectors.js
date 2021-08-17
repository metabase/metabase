import Settings from "metabase/lib/settings";

export const getAdminEmail = () => Settings.get("admin-email");
