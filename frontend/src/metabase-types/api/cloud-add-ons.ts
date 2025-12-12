export interface PurchaseCloudAddOnRequest {
  product_type: "metabase-ai" | "metabase-ai-tiered" | "python-execution";
  quantity?: number;
  terms_of_service: boolean;
}
