export type PurchaseCloudAddOnRequest =
  | {
      product_type: "metabase-ai";
      terms_of_service: boolean;
    }
  | {
      product_type: "python-execution";
    };
