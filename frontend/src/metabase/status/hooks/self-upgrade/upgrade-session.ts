const SESSION_KEY = "metabase-self-upgrade";

export interface UpgradeSession {
  targetVersion: string;
  startedAt: number;
  hasStarted: boolean;
  errorMessage?: string;
  newVersion?: string;
}

export function readUpgradeSession(): UpgradeSession | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(SESSION_KEY) ?? "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "targetVersion" in value &&
      typeof value.targetVersion === "string" &&
      "startedAt" in value &&
      typeof value.startedAt === "number" &&
      "hasStarted" in value &&
      typeof value.hasStarted === "boolean"
    ) {
      return {
        targetVersion: value.targetVersion,
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
    }
  } catch {
    return null;
  }
  return null;
}

export function writeUpgradeSession(session: UpgradeSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearUpgradeSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
