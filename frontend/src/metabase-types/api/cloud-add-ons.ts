export type CloudAddOnProductType =
  | "metabase-ai"
  | "metabase-ai-tiered"
  | "metabase-ai-managed"
  | "python-execution"
  | "transforms-basic"
  | "transforms-advanced";

export interface PurchaseCloudAddOnRequest {
  product_type: CloudAddOnProductType;
  quantity?: number;
  terms_of_service?: boolean;
}

export interface RemoveCloudAddOnRequest {
  product_type: CloudAddOnProductType;
}
