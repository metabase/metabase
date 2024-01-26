export interface StoreTokenStatus {
  status?: string;
  valid: boolean;
  trial: boolean;
}

export const supportedFormatTypes = [
  "string",
  "integer",
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
  | { display: "value"; link: string }
  | ({ display: string } & Record<string, any>);

type BillingInfoDisplayable<Type> =
  | (Type & BillingInfoDisplayType)
  | (Type & Record<keyof BillingInfoDisplayType, undefined>);

type BillingInfoFormatType =
  | { name: string; value: string; format: "string" }
  | { name: string; value: number; format: "integer" }
  | { name: string; value: string; format: "datetime" }
  | { name: string; value: number; format: "currency"; currency: string };

export type BillingInfoLineItem = BillingInfoDisplayable<BillingInfoFormatType>;

export type BillingInfo = BillingInfoLineItem[];

export type BillingInfoResponse = {
  version: number;
  content: BillingInfo;
};
