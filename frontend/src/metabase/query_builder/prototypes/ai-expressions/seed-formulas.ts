import type { SeedFormula } from "../shared/types";

// PROTOTYPE: mocked. Hardcoded custom aggregations over the Sample Database, by table name: ratios,
// conditional aggregates, date math, text functions, and implicit joins, beyond Sum/Count/Average.
export const SEED_FORMULAS_BY_TABLE: Readonly<
  Record<string, readonly SeedFormula[]>
> = {
  ORDERS: [
    {
      name: "Discounted order share",
      source: "Share([Discount] > 0)",
      description: "The fraction of orders that got any discount.",
    },
    {
      name: "Effective discount rate",
      source: "Sum([Discount]) / Sum([Subtotal])",
      description: "How much of gross revenue discounts give away.",
    },
    {
      name: "Discount lift on order total",
      source:
        "Average(case([Discount] > 0, [Total])) - Average(case(isNull([Discount]), [Total]))",
      description:
        "How much bigger the average discounted order is than a full-price one.",
    },
    {
      name: "Orders per customer",
      source: "Count() / Distinct([User ID])",
      description: "Repeat purchasing: orders divided by distinct buyers.",
    },
    {
      name: "Revenue per unit",
      source: "Sum([Subtotal]) / Sum([Quantity])",
      description: "The average price a unit actually sold for.",
    },
    {
      name: "Bulk order revenue share",
      source: "SumIf([Total], [Quantity] >= 10) / Sum([Total])",
      description: "The share of revenue from orders of 10 or more units.",
    },
    {
      name: "Widget revenue share",
      source: 'SumIf([Total], [Product → Category] = "Widget") / Sum([Total])',
      description:
        "The share of revenue from Widgets, through the implicit join to Products.",
    },
    {
      name: "Weekend order share",
      source: "Share(weekday([Created At]) = 1 OR weekday([Created At]) = 7)",
      description: "The fraction of orders placed on a Saturday or Sunday.",
    },
    {
      name: "Tax rate",
      source: "Sum([Tax]) / Sum([Subtotal])",
      description: "The effective tax rate across orders.",
    },
  ],
  PRODUCTS: [
    {
      name: "Price spread",
      source: "Max([Price]) - Min([Price])",
      description: "The gap between the most and least expensive product.",
    },
    {
      name: "Premium product share",
      source: "Share([Price] > 75)",
      description: "The fraction of products priced over $75.",
    },
    {
      name: "4+ star share",
      source: "Share([Rating] >= 4)",
      description: "The fraction of products rated 4 stars or higher.",
    },
    {
      name: "Rating-weighted price",
      source: "Sum([Price] * [Rating]) / Sum([Rating])",
      description:
        "The average price, weighted toward better-rated products: above the plain average when good products cost more.",
    },
    {
      name: "Products per vendor",
      source: "Count() / Distinct([Vendor])",
      description: "How concentrated the catalog is across vendors.",
    },
    {
      name: "Average title length",
      source: "Average(length([Title]))",
      description: "The average number of characters in a product title.",
    },
  ],
  PEOPLE: [
    {
      name: "Average age",
      source: 'Average(datetimeDiff([Birth Date], now(), "year"))',
      description: "Customers' average age today, from their birth dates.",
    },
    {
      name: "Under-30 share",
      source: 'Share(datetimeDiff([Birth Date], now(), "year") < 30)',
      description: "The fraction of customers younger than 30.",
    },
    {
      name: "Gmail share",
      source: 'Share(endsWith([Email], "@gmail.com"))',
      description: "The fraction of customers signed up with a Gmail address.",
    },
    {
      name: "Paid social and search share",
      source:
        'Share([Source] = "Facebook" OR [Source] = "Google" OR [Source] = "Twitter")',
      description:
        "The fraction of customers acquired through ads rather than Organic or Affiliate.",
    },
    {
      name: "States reached",
      source: "Distinct([State])",
      description: "How many states customers come from.",
    },
    {
      name: "Average tenure (days)",
      source: 'Average(datetimeDiff([Created At], now(), "day"))',
      description: "How long, on average, customers have had an account.",
    },
  ],
  REVIEWS: [
    {
      name: "Net promoter score",
      source:
        "(CountIf([Rating] = 5) - CountIf([Rating] <= 3)) / Count() * 100",
      description:
        "5-star reviews minus 1–3 star reviews, as a percentage of all reviews.",
    },
    {
      name: "Average review length",
      source: "Average(length([Body]))",
      description: "The average number of characters in a review.",
    },
    {
      name: "Reviews per product",
      source: "Count() / Distinct([Product ID])",
      description: "How many reviews a reviewed product gets, on average.",
    },
    {
      name: "Low rating share",
      source: "Share([Rating] <= 2)",
      description: "The fraction of reviews with 1 or 2 stars.",
    },
    {
      name: "Long angry reviews",
      source: "CountIf([Rating] <= 2 AND length([Body]) > 200)",
      description: "Low-rated reviews long enough to explain what went wrong.",
    },
  ],
  ACCOUNTS: [
    {
      name: "Trial conversion rate",
      source: "Share([Trial Converted])",
      description: "The fraction of trials that became paying accounts.",
    },
    {
      name: "Churn rate",
      source: "Share(notNull([Canceled At]))",
      description: "The fraction of accounts that have canceled.",
    },
    {
      name: "Seats per active account",
      source:
        "SumIf([Seats], [Active Subscription]) / CountIf([Active Subscription])",
      description: "The average seat count of accounts still subscribed.",
    },
    {
      name: "Average days to cancel",
      source: 'Average(datetimeDiff([Created At], [Canceled At], "day"))',
      description: "How long canceled accounts lasted before canceling.",
    },
    {
      name: "Average trial length (days)",
      source: 'Average(datetimeDiff([Created At], [Trial Ends At], "day"))',
      description: "How many days a trial runs, on average.",
    },
    {
      name: "Legacy plan share",
      source: "Share([Legacy Plan])",
      description: "The fraction of accounts still on a legacy plan.",
    },
  ],
  INVOICES: [
    {
      name: "Revenue per account",
      source: "Sum([Payment]) / Distinct([Account ID])",
      description: "Lifetime payments per invoiced account.",
    },
    {
      name: "Unexpected invoice share",
      source: "Share(not [Expected Invoice])",
      description: "The fraction of invoices nobody expected.",
    },
    {
      name: "Business plan revenue share",
      source: 'SumIf([Payment], [Plan] = "Business") / Sum([Payment])',
      description: "The share of revenue from the Business plan.",
    },
    {
      name: "Premium to Basic payment ratio",
      source:
        'Average(case([Plan] = "Premium", [Payment])) / Average(case([Plan] = "Basic", [Payment]))',
      description:
        "How many times a Basic payment the average Premium payment is.",
    },
    {
      name: "Paying accounts",
      source: "DistinctIf([Account ID], [Payment] > 0)",
      description: "Accounts with at least one nonzero payment.",
    },
  ],
  ANALYTIC_EVENTS: [
    {
      name: "Events per account",
      source: "Count() / Distinct([Account ID])",
      description: "How active an account is, on average.",
    },
    {
      name: "Click-through rate",
      source:
        'CountIf([Event] = "Button Clicked") / CountIf([Event] = "Page Viewed")',
      description: "Button clicks per page view.",
    },
    {
      name: "Checkouts per signup",
      source:
        'CountIf([Button Label] = "Checkout") / CountIf([Button Label] = "Signup")',
      description: "A rough funnel: Checkout clicks for every Signup click.",
    },
    {
      name: "Help page share",
      source: 'Share(endsWith([Page URL], "/help"))',
      description: "The fraction of events on the help page.",
    },
    {
      name: "Subscribing accounts",
      source: 'DistinctIf([Account ID], [Button Label] = "Subscribe")',
      description: "Accounts that clicked Subscribe at least once.",
    },
  ],
  FEEDBACK: [
    {
      name: "CSAT",
      source: "Share([Rating] >= 4)",
      description: "The fraction of feedback rated Good or Great.",
    },
    {
      name: "Net sentiment",
      source: "(CountIf([Rating] >= 4) - CountIf([Rating] <= 2)) / Count()",
      description:
        "Good-or-better minus Below Average-or-worse, over all feedback.",
    },
    {
      name: "Average feedback length",
      source: "Average(length([Body]))",
      description: "The average number of characters in a piece of feedback.",
    },
    {
      name: "Accounts giving feedback",
      source: "Distinct([Account ID])",
      description: "How many accounts sent feedback.",
    },
  ],
};
