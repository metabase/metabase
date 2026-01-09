import type { ICloudAddOnProductTier } from "metabase-types/api";

export interface IMetabotPurchaseFormFields {
  quantity: string;
  terms_of_service: boolean;
}

export interface IPageForNonStoreUserProps {
  anyStoreUserEmailAddress?: string;
}

export interface IMetabotRadioProps {
  selected?: boolean;
  value: string;
  title: string;
  description: string;
  price: string;
}

export interface IMetabotRadiosProps {
  tiers: ICloudAddOnProductTier[];
  quantity: string;
  billingPeriodMonths: number;
}
