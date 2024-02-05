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
  | { display: "value" }
  | ({ display: string } & Record<string, any>);

type BillingInfoFormatType =
  | { name: string; value: string; format: "string" }
  | { name: string; value: number; format: "integer" }
  | { name: string; value: number; format: "float" }
  | { name: string; value: string; format: "datetime" }
  | { name: string; value: number; format: "currency"; currency: string };

export type BillingInfoLineItem = BillingInfoFormatType &
  BillingInfoDisplayType;

export type BillingInfo = {
  version: number;
  content: BillingInfoLineItem[] | null;
};
