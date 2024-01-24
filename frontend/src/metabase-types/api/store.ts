export interface StoreTokenStatus {
  status?: string;
  valid: boolean;
  trial: boolean;
}

type BillingInfoLineItemTypes =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "link"; title: string; value: string };

export type BillingInfoLineItem = BillingInfoLineItemTypes & {
  name: string;
};

export type BillingInfo = BillingInfoLineItem[];
