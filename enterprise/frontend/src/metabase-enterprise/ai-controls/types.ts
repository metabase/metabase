export type GroupTab = "user-groups" | "tenant-groups";

/**
 * Resolves to whether the mode changed. A failure has already been reported
 * to the user by the time this resolves, so the caller only decides what to
 * do on success.
 */
export type SwitchAdvancedMode = () => Promise<boolean>;
