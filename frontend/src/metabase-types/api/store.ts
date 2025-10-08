import type { TokenFeature } from "./settings";

export interface StoreTokenStatus {
  status?: string;
  valid: boolean;
  trial: boolean;
}

export const supportedFormatTypes = [
  "string",
  "integer",
  "float",
  "datetime",
  "currency",
] as const;

export const supportedDisplayTypes = [
  "internal-link",
  "external-link",
  "value",
] as const;

type BillingInfoDisplayType =
  | { display: "internal-link"; link: string }
  | { display: "external-link"; link: string }
  | { display: "value" };

type BillingInfoFormatType =
  | { name: string; value: string; format: "string" }
  | { name: string; value: number; format: "integer" }
  | { name: string; value: number; format: "float"; precision: number }
  | { name: string; value: string; format: "datetime" }
  | { name: string; value: number; format: "currency"; currency: string };

export type BillingInfoLineItem = BillingInfoFormatType &
  BillingInfoDisplayType;

export type BillingInfo = {
  version: string;
  content: BillingInfoLineItem[] | null;
};

export interface MetabasePlan {
  id: number;
  name: MetabasePlanName;
  description: string;
  alias: MetabasePlanAlias;
  product: string;
  can_purchase: boolean;
  billing_period_months: BillingPeriodMonths;
  trial_days: number;
  users_included: number;
  per_user_price: string;
  price: string;

  hosting_features: MetabasePlanHostingFeature[];
  token_features: TokenFeature[];

  addon_price?: string;
  base_price?: string;
}

export type MetabasePlansResponse = MetabasePlan[];

export type MetabasePlanHostingFeature =
  | "can-have-dev-subscription"
  | "clickhouse-dwh"
  | "custom-domain"
  | "dedicated-node"
  | "invoiceable"
  | "invoicing-eligibility"
  | "is-dev-subscription"
  | "metabase-api-key"
  | "trial-up";

export type MetabasePlanName =
  | "Metabase Cloud Starter Plan (Yearly, with Storage)"
  | "Metabase Dev Instance Cloud (Monthly)"
  | "Metabase Cloud Starter Plan"
  | "Metabase Pro Cloud (Yearly)"
  | "Metabase Cloud Starter Plan (with Storage)"
  | "Metabase Cloud Starter Plan (Yearly)"
  | "Metabase Dev Instance Cloud (Yearly)"
  | "Metabase Cloud - Business"
  | "Metabase Pro Self-Hosted (Yearly)"
  | "Metabase Dev Instance Self-Hosted (Monthly)"
  | "Metabase Pro Self-Hosted"
  | "Metabase Pro Cloud (with Storage)"
  | "Metabase Pro Cloud"
  | "Metabase Pro Cloud (Yearly, with Storage)"
  | "Metabase Dev Instance Self-Hosted (Yearly)";

export type MetabasePlanAlias =
  | "business"
  | "pro-cloud"
  | "pro-cloud-dev"
  | "pro-cloud-dev-yearly"
  | "pro-cloud-with-dwh"
  | "pro-cloud-with-dwh-yearly"
  | "pro-cloud-yearly"
  | "pro-self-hosted"
  | "pro-self-hosted-dev"
  | "pro-self-hosted-dev-yearly"
  | "pro-self-hosted-yearly"
  | "starter"
  | "starter-with-dwh"
  | "starter-with-dwh-yearly"
  | "starter-yearly";

export type BillingPeriodMonths = 1 | 12;

export interface MetabaseAddon {
  id: number;
  name: string;
  short_name: string;
  description: string | null;
  alias: MetabaseAddonAlias;
  product_type: MetabaseAddonProductType;
  deployment: string;
  billing_period_months: BillingPeriodMonths;
  active: boolean;
  self_service: boolean;

  hosting_features: MetabaseAddonHostingFeature[];
  token_features: TokenFeature[];

  trialup_to_product_id: string | null;
  invoiceable_counterpart: string | null;
  trial_days: number | null;
  is_metered: boolean | null;

  default_total_units: number;
  default_included_units: number;
  default_prepaid_units: number;
  default_price_per_unit: number;
  default_base_fee: number;
}

export type MetabaseAddonsResponse = MetabaseAddon[];

export type MetabaseAddonAlias =
  | "metabase-ai"
  | "metabase-ai-yearly"
  | "etl-connections"
  | "etl-connections-yearly"
  | "dwh"
  | "dwh-yearly"
  | "python-execution"
  | "python-execution-yearly"
  | "metabase-ai-tiered"
  | "metabase-ai-tiered-yearly";

export type MetabaseAddonProductType =
  | "metabase-ai"
  | "etl-connections"
  | "dwh"
  | "python-execution"
  | "metabase-ai-tiered";

export type MetabaseAddonHostingFeature =
  | "metabase-ai"
  | "semantic-search-db"
  | "etl-connections"
  | "metabase-api-key"
  | "clickhouse-dwh"
  | "python-runner";
