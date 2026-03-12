import type { ICloudAddOnProduct } from "metabase-types/api";

export function createMockCloudAddOns(
  opts?: Partial<ICloudAddOnProduct>,
): Partial<ICloudAddOnProduct>[] {
  const billing_period_months = opts?.billing_period_months || 1;

  return [
    {
      // matching product type, monthly cadence:
      active: true,
      billing_period_months: 1,
      product_tiers: [
        {
          id: 1,
          is_default: false,
          name: "metabase_ai_tier1",
          price: 111,
          quantity: 1234,
        },
        {
          id: 2,
          is_default: true,
          name: "metabase_ai_tier2",
          price: 222,
          quantity: 2345,
        },
      ],
      product_type: "metabase-ai-tiered",
      self_service: true,
    },
    {
      // matching product type, yearly cadence:
      active: true,
      billing_period_months: 12,
      product_tiers: [
        {
          id: 3,
          is_default: false,
          name: "metabase_ai_tier3",
          price: 333,
          quantity: 3456,
        },
        {
          id: 4,
          is_default: true,
          name: "metabase_ai_tier4",
          price: 444,
          quantity: 4567,
        },
      ],
      product_type: "metabase-ai-tiered",
      self_service: true,
    },
    {
      // product matches our subscription but is inactive:
      active: false,
      billing_period_months,
      product_tiers: [
        {
          id: 5,
          is_default: true,
          name: "metabase_ai_tier5",
          price: 555,
          quantity: 5678,
        },
      ],
      product_type: "metabase-ai-tiered",
      self_service: true,
    },
    {
      // product matches our subscription but is not for self-service:
      active: true,
      billing_period_months,
      product_tiers: [
        {
          id: 6,
          is_default: true,
          name: "metabase_ai_tier6",
          price: 666,
          quantity: 6789,
        },
      ],
      product_type: "metabase-ai-tiered",
      self_service: false,
    },
    {
      // different product with the same billing period:
      active: true,
      billing_period_months,
      product_tiers: [
        {
          id: 8,
          name: "other_tier8",
          price: 888,
          quantity: 8901,
          is_default: true,
        },
      ],
      product_type: "other",
      self_service: true,
    },
  ];
}
