export interface PurchaseCloudAddOnRequest {
  product_type:
    | "metabase-ai"
    | "metabase-ai-tiered"
    | "python-execution"
    | "transforms-basic"
    | "transforms-advanced";
  quantity?: number;
  terms_of_service?: boolean;
}
