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

interface IBillingInfoData {
  billing_period_months?: number | null;
  previous_add_ons?: { product_type: string; self_service: boolean }[] | null;
}

export type BillingInfo = {
  version: string;
  content?: BillingInfoLineItem[] | null;
  data?: IBillingInfoData | null;
};

export interface ICloudAddOnProductTier {
  id: number;
  is_default: boolean;
  name: string;
  price: number;
  quantity: number;
}

export interface ICloudAddOnProduct {
  active: boolean;
  billing_period_months: number;
  default_base_fee: number;
  default_included_units: number;
  default_prepaid_units: number;
  default_price_per_unit: number;
  default_total_units: number;
  deployment: string;
  description: string | null;
  id: number;
  is_metered: boolean | null;
  name: string;
  product_tiers: ICloudAddOnProductTier[];
  product_type: string;
  self_service: boolean;
  short_name: string;
  token_features: TokenFeature[];
  trial_days: number | null;
}

export type GetCloudAddOnsResponse = ICloudAddOnProduct[];
