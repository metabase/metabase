export type DataCheckTableSchema = {
  name: string;
  columns: readonly string[];
};

export const DQ_TABLES: readonly DataCheckTableSchema[] = [
  {
    name: "customers",
    columns: [
      "customer_id",
      "email",
      "country",
      "tier",
      "created_at",
      "churned_at",
    ],
  },
  {
    name: "products",
    columns: ["product_id", "sku", "category", "unit_price", "is_active"],
  },
  {
    name: "orders",
    columns: [
      "order_id",
      "customer_id",
      "order_date",
      "status",
      "currency",
      "total_amount",
      "shipped_at",
    ],
  },
  {
    name: "order_lines",
    columns: [
      "line_id",
      "order_id",
      "product_id",
      "quantity",
      "unit_price",
      "line_amount",
    ],
  },
  {
    name: "payments",
    columns: ["payment_id", "order_id", "paid_at", "amount", "method"],
  },
  {
    name: "daily_revenue",
    columns: ["day", "order_count", "revenue", "refunds", "net_revenue"],
  },
  {
    name: "cfg_billing",
    columns: ["gap_months", "last_complete_period", "cap_period"],
  },
  { name: "date_spine", columns: ["day"] },
  { name: "currencies", columns: ["code", "name"] },
  {
    name: "customer_tier_history",
    columns: ["customer_id", "tier", "valid_from", "valid_to"],
  },
];
