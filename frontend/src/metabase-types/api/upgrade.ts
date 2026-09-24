export type UpgradeOperation = "upgrade" | "downgrade";

export interface UpgradeResponse {
  status: string;
  instructions?: string;
}

export type UpgradeHealthStatus = "not-upgrading" | "upgrading" | "downloaded";

export interface UpgradeHealth {
  status: UpgradeHealthStatus;
  total?: number;
  current?: number;
}
