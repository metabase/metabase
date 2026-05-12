export type WorkloadJobType =
  | "sync"
  | "transform-job"
  | "alert"
  | "dashboard-subscription"
  | "persisted-refresh";

export type WorkloadRange = "forecast" | "history";

export type WorkloadCell = {
  day: string; // ISO date "2026-05-13"
  hour: number; // 0..23
  minute: number; // 0/5/10/.../55 — 5-min granularity bucket start
  weight: number; // sub-op count
  by_type: Partial<Record<WorkloadJobType, number>>;
};

export type WorkloadGridResponse = {
  cells: WorkloadCell[];
  scale_max: number;
  scheduler_status: "running" | "stopped";
};

export type WorkloadSlotRow = {
  type: WorkloadJobType;
  entity_id: number | null;
  entity_name: string | null;
  cron: string | null;
  fire_at: string;
  weight: number;
  settings_url: string | null;
};

export type WorkloadQueryParams = {
  from: string;
  to: string;
  types?: string; // comma-separated WorkloadJobType
};
