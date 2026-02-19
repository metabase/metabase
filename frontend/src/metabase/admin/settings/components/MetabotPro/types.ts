export type MetabotProProvider = "anthropic" | "openrouter" | "bedrock";

export interface ProviderOption {
  value: MetabotProProvider;
  label: string;
  description: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface HealthCheckItem {
  id: string;
  label: string;
  description: string;
  status: "pass" | "warning" | "missing";
  recommendation?: string;
}

export interface SemanticSearchStatus {
  configured: boolean;
  indexingProgress?: number;
  isActive: boolean;
}

export type TierStatus = "incomplete" | "in_progress" | "complete";
