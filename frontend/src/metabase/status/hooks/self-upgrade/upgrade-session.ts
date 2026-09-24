const SESSION_KEY = "metabase-self-upgrade";

export type UpgradeVersions =
  | { operation: "upgrade"; targetVersion: string }
  | { operation: "downgrade"; currentVersion: string };

export type UpgradeSession = UpgradeVersions & {
  startedAt: number;
  hasStarted: boolean;
  errorMessage?: string;
  newVersion?: string;
};

export function readUpgradeSession(): UpgradeSession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "startedAt" in value &&
      typeof value.startedAt === "number" &&
      "hasStarted" in value &&
      typeof value.hasStarted === "boolean"
    ) {
      const state = {
        startedAt: value.startedAt,
        hasStarted: value.hasStarted,
        errorMessage:
          "errorMessage" in value && typeof value.errorMessage === "string"
            ? value.errorMessage
            : undefined,
        newVersion:
          "newVersion" in value && typeof value.newVersion === "string"
            ? value.newVersion
            : undefined,
      };
      const currentVersion =
        "currentVersion" in value && typeof value.currentVersion === "string"
          ? value.currentVersion
          : undefined;
      const targetVersion =
        "targetVersion" in value && typeof value.targetVersion === "string"
          ? value.targetVersion
          : undefined;
      const operation = "operation" in value ? value.operation : "upgrade";
      if (operation === "downgrade") {
        if (currentVersion) {
          return {
            ...state,
            operation: "downgrade",
            currentVersion,
          };
        }
      } else if (operation === "upgrade" && targetVersion) {
        return {
          ...state,
          operation: "upgrade",
          targetVersion,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isUpgradeInProgress(session: UpgradeSession | null) {
  return session != null && !session.newVersion && !session.errorMessage;
}

export function writeUpgradeSession(session: UpgradeSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearUpgradeSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
