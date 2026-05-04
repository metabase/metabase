import type { AddOnProductType } from "./store";

export interface PurchaseCloudAddOnRequest {
  product_type: AddOnProductType;
  quantity?: number;
  terms_of_service?: boolean;
}

export interface RemoveCloudAddOnRequest {
  product_type: AddOnProductType;
}
