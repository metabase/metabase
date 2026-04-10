"""
Tier 3: Cross-Source Integration

This module tests the agent's ability to integrate data across different business
systems (schemas) to create comprehensive analytical views. This is the highest
level of analytical sophistication, requiring:

1. Understanding common linkage keys across systems (email, customer_id, name)
2. Recognizing when cross-source integration adds analytical value
3. Managing schema/grain mismatches across systems
4. Constructing meaningful business metrics from multi-source data

Example cross-source scenarios:
- Customer 360: Combine Stripe (revenue) + Shopify (purchases) + Salesforce (CRM)
- Marketing Attribution: LinkedIn/AdWords (spend) → Salesforce (leads) → Stripe (revenue)
- Financial Overview: Stripe (revenue) + QuickBooks (invoicing) + Brex (expenses)
- Recruitment Pipeline: Lever (hiring) + Brex (recruiting spend)

Key Analytical Skills:
1. Identifying common join keys (email is primary)
2. Understanding business value of cross-source queries
3. Handling grain mismatches (customer-level vs. transaction-level)
4. Temporal alignment across sources

Key Challenge: Agent must identify common keys (email is the most common) and
understand which combinations provide meaningful business insights.
"""

TEST_DATA = [
    # =============================================================================
    # CUSTOMER 360: STRIPE + SHOPIFY
    # =============================================================================
    # Test cases combining subscription revenue (Stripe) with e-commerce (Shopify)
    # to get complete customer lifetime value.
    #
    # Examples:
    # - "Total customer LTV combining Stripe and Shopify revenue"
    # - "Customers with both subscriptions and e-commerce purchases"
    # - "Which customers spend more on subscriptions vs. products?"
    #
    # Business Domains: Stripe + Shopify
    # Join Key: email (customer_email / email)
    # Expected Tables: int_stripe_customers_dim + int_shopify_customer_dim
    # =============================================================================
    # Test 1: Combined customer lifetime value
    {
        "description": "Total LTV across Stripe and Shopify",
        "message": "Calculate combined lifetime value for customers in both Stripe and Shopify. Inner join Stripe and Shopify customers on email. Add the lifetime revenue from Stripe and lifetime value from Shopify, treating nulls as zero. Return email and combined lifetime value. Order by combined lifetime value descending, using email ascending as a tiebreaker.",
        "table_names": ["stripe_enriched.int_stripe_customers_dim", "shopify_enriched.int_shopify_customer_dim"],
    },
    # Test 2: Customer overlap analysis
    {
        "description": "Customers active in both Stripe and Shopify",
        "message": "Find customers who have both subscription and e-commerce activity. Inner join Stripe and Shopify customers on email. Return email, customer name, Stripe lifetime revenue, Shopify lifetime value, and Shopify lifetime orders. Order by email ascending.",
        "table_names": ["stripe_enriched.int_stripe_customers_dim", "shopify_enriched.int_shopify_customer_dim"],
    },
    # Test 3: Revenue mix analysis
    {
        "description": "Subscription vs e-commerce revenue by customer",
        "message": "Compare subscription versus e-commerce spend per customer. Inner join Stripe and Shopify customers on email. Return email, Stripe lifetime revenue, and Shopify lifetime value. Order by email ascending.",
        "table_names": ["stripe_enriched.int_stripe_customers_dim", "shopify_enriched.int_shopify_customer_dim"],
    },
    # =============================================================================
    # CUSTOMER 360: STRIPE + SHOPIFY + SALESFORCE
    # =============================================================================
    # Test cases creating comprehensive customer profiles across all systems.
    #
    # Examples:
    # - "Complete customer journey: lead → purchase → subscription"
    # - "Customers in Salesforce with Stripe or Shopify revenue"
    # - "Multi-touch customer revenue across all platforms"
    #
    # Business Domains: Stripe + Shopify + Salesforce
    # Join Keys: Email across all three systems
    # Expected Tables: Dimension tables from all three sources
    # =============================================================================
    # Test 4: Three-way customer integration
    {
        "description": "Complete customer profile across CRM, subscriptions, and e-commerce",
        "message": "Find customers who appear in all three systems: Salesforce, Stripe, and Shopify. Inner join all three customer tables on email. Return email and customer name. Order by email ascending.",
        "table_names": [
            "salesforce_enriched.int_salesforce_contact_dim",
            "stripe_enriched.int_stripe_customers_dim",
            "shopify_enriched.int_shopify_customer_dim",
        ],
    },
    # Test 5: Lead source to revenue
    {
        "description": "Revenue by original lead source across all platforms",
        "message": "Calculate total revenue by original lead source. Left join lead conversion data to Stripe and Shopify customers on email. Sum the combined lifetime revenue from both platforms (treating nulls as zero), grouped by lead source. Return lead source and combined revenue. Order by combined revenue descending.",
        "table_names": [
            "salesforce_enriched.int_salesforce_lead_conversion_facts",
            "stripe_enriched.int_stripe_customers_dim",
            "shopify_enriched.int_shopify_customer_dim",
        ],
    },
    # =============================================================================
    # FINANCIAL OVERVIEW: STRIPE + BREX
    # =============================================================================
    # Test cases combining revenue and expenses for financial analysis.
    #
    # Examples:
    # - "Total revenue (Stripe) vs. total expenses (Brex)"
    # - "Profit margin: revenue - expenses"
    # - "Monthly burn rate analysis"
    #
    # Business Domains: Stripe + Brex
    # Join Keys: Time periods (monthly)
    # Expected Pattern: Time-based aggregation across sources
    # =============================================================================
    # Test 6: Monthly revenue vs expenses
    {
        "description": "Revenue and expenses by month",
        "message": "Compare monthly revenue from Stripe with monthly expenses from Brex. Aggregate MRR by month from Stripe and expenses by month from Brex. Combine using a full outer join on month to include all months from either source. Return month, total revenue, and total expenses. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact", "brex_enriched.int_brex_expense_facts"],
    },
    # Test 7: Gross margin calculation
    {
        "description": "Monthly gross margin",
        "message": "Calculate monthly gross margin. Aggregate Stripe revenue and Brex expenses by month separately. Combine using a full outer join on month. Calculate gross margin as revenue minus expenses, treating nulls as zero. Return month, total revenue, total expenses, and gross margin. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact", "brex_enriched.int_brex_expense_facts"],
    },
    # Test 8: Burn rate analysis
    {
        "description": "Monthly burn rate trend",
        "message": "Calculate monthly burn rate over time. Aggregate Stripe revenue and Brex expenses by month separately. Combine using a full outer join on month. Calculate burn rate as expenses minus revenue, treating nulls as zero. Return month and burn rate. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact", "brex_enriched.int_brex_expense_facts"],
    },
    # =============================================================================
    # RECRUITMENT EFFICIENCY: LEVER + BREX
    # =============================================================================
    # Test cases analyzing hiring pipeline with costs.
    #
    # Examples:
    # - "Hiring cost per position (Lever + Brex recruiting expenses)"
    # - "Recruiting ROI: employees hired vs. recruiting spend"
    # - "Cost per hire by department"
    #
    # Business Domains: Lever + Brex
    # Join Keys: Department, time period
    # Expected Pattern: Hiring metrics + expense allocation
    # =============================================================================
    # Test 9: Cost per hire
    {
        "description": "Recruiting expenses per hire",
        "message": "Calculate cost per hire. Sum expenses where transaction category is 'Recruiting'. Count hired candidates from the hiring funnel where archive reason is 'Hired'. Calculate cost per hire as total recruiting spend divided by hire count, handling division by zero. Return total recruiting spend, hire count, and cost per hire.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts", "brex_enriched.int_brex_expense_facts"],
    },
    # Test 10: Recruiting spend efficiency
    {
        "description": "Recruiting investment vs hiring outcomes",
        "message": "Compare recruiting spend against hiring outcomes. Sum expenses where transaction category is 'Recruiting'. Count candidates who were hired (where archive reason is 'Hired'). Return total recruiting expenses and count of successful hires.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts", "brex_enriched.int_brex_expense_facts"],
    },
    # =============================================================================
    # CUSTOMER ENGAGEMENT: SHOPIFY + CUSTOMER.IO
    # =============================================================================
    # Test cases linking e-commerce behavior to email marketing engagement.
    #
    # Examples:
    # - "Purchase rate of email engaged customers"
    # - "Email engagement correlation with purchase frequency"
    # - "LTV of customers by email engagement level"
    #
    # Business Domains: Shopify + Customer.io
    # Join Keys: Email
    # Expected Tables: shopify_customer_dim + customerio_customer_dim
    # =============================================================================
    # Test 11: Purchase behavior vs email engagement
    {
        "description": "Customer purchases correlated with email engagement",
        "message": "Analyze purchase behavior by email engagement level. Left join Shopify customers to Customer.io customers on email. Group by engagement level. Calculate the average lifetime value and average lifetime orders for each level. Return engagement level, average lifetime value, and average orders. Order by engagement level ascending.",
        "table_names": [
            "shopify_enriched.int_shopify_customer_dim",
            "customerio_enriched.int_customerio_customer_dim",
        ],
    },
    # Test 12: Email-influenced revenue
    {
        "description": "Lifetime value by email engagement level",
        "message": "Calculate average customer lifetime value by email engagement level. Left join Shopify customers to Customer.io engagement data on email. Group by engagement level and calculate the average lifetime value. Return engagement level and average lifetime value. Order by engagement level ascending.",
        "table_names": [
            "shopify_enriched.int_shopify_customer_dim",
            "customerio_enriched.int_customerio_engagement_facts",
        ],
    },
    # =============================================================================
    # B2B PIPELINE: SALESFORCE + CALENDLY
    # =============================================================================
    # Test cases connecting meeting scheduling to sales pipeline.
    #
    # Examples:
    # - "Opportunity creation rate after Calendly meetings"
    # - "Meeting to opportunity conversion"
    # - "Which meeting types lead to highest pipeline value?"
    #
    # Business Domains: Salesforce + Calendly
    # Join Keys: Email, potentially contact/lead matching
    # Expected Pattern: Meeting activity correlation with pipeline
    # =============================================================================
    # Test 13: Meetings to opportunities
    {
        "description": "Meeting activity correlated with pipeline",
        "message": "Calculate the meeting-to-opportunity conversion rate. Left join Calendly invitees to Salesforce opportunities on email. Count total invitees and count those who have an associated opportunity (where opportunity id is not null). Calculate conversion rate as invitees with opportunities divided by total, expressed as a percentage. Return total invitees, invitees with opportunities, and conversion rate.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "calendly_enriched.int_calendly_invitee_facts",
        ],
    },
    # Test 14: Meeting types and pipeline value
    {
        "description": "Pipeline value by meeting type",
        "message": "Analyze average opportunity value by Calendly meeting type. Left join Calendly events to Salesforce opportunities on invitee email. Group by event type name. Calculate the average opportunity amount for each meeting type. Return event type name and average pipeline value. Order by average pipeline value descending.",
        "table_names": [
            "salesforce_enriched.int_salesforce_opportunity_facts",
            "calendly_enriched.int_calendly_event_facts",
        ],
    },
    # =============================================================================
    # AD PLATFORM COMPARISON: GOOGLE ADWORDS + LINKEDIN ADS
    # =============================================================================
    # Test cases comparing performance across advertising platforms.
    #
    # Examples:
    # - "Total ad spend across all platforms"
    # - "Which platform has better ROI?"
    # - "Cost per conversion: Google vs. LinkedIn"
    #
    # Business Domains: Google AdWords + LinkedIn Ads
    # Join Keys: Time period, campaign if naming consistent
    # Expected Pattern: UNION or separate aggregations compared
    # =============================================================================
    # Test 15: Combined ad spend
    {
        "description": "Total advertising spend across platforms",
        "message": "Calculate total advertising spend across platforms. Combine Google AdWords and LinkedIn Ads data using union all, labeling each with its platform name. Sum the cost for each platform. Return platform name and total spend. Order by platform name ascending.",
        "table_names": [
            "google_adwords_enriched.int_google_adwords_keyword_performance_facts",
            "linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts",
        ],
    },
    # Test 16: Platform efficiency comparison
    {
        "description": "Cost per click comparison across platforms",
        "message": "Compare cost per click between advertising platforms. Combine Google AdWords and LinkedIn Ads data using union all, labeling each with its platform name. Calculate cost per click as total cost divided by total clicks for each platform, handling division by zero. Return platform name and cost per click. Order by platform name ascending.",
        "table_names": [
            "google_adwords_enriched.int_google_adwords_keyword_performance_facts",
            "linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts",
        ],
    },
    # Test 17: Platform performance trends
    {
        "description": "Monthly ad performance by platform",
        "message": "Show monthly ad performance for both platforms. Combine Google AdWords and LinkedIn Ads data using union all, labeling each with its platform name. Group by calendar month and platform. Sum cost, impressions, and clicks for each. Return month, platform, total spend, total impressions, and total clicks. Order by month ascending, then platform ascending.",
        "table_names": [
            "google_adwords_enriched.int_google_adwords_keyword_performance_facts",
            "linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts",
        ],
    },
    # =============================================================================
    # SUPPORT + REVENUE CORRELATION: SALESFORCE CASES + STRIPE
    # =============================================================================
    # Test cases analyzing support ticket impact on customer revenue.
    #
    # Examples:
    # - "Churn rate of customers with support cases"
    # - "LTV correlation with support case count"
    # - "Revenue impact of support response time"
    #
    # Business Domains: Salesforce (case_facts) + Stripe
    # Join Keys: Email or customer reference
    # Expected Pattern: Support metrics joined to customer revenue
    # =============================================================================
    # Test 18: Support impact on churn
    {
        "description": "Churn correlation with support cases",
        "message": "Compare churn rates by support case status. Left join churn data to support case data on email. Classify customers as 'With Support Cases' (if case id is not null) or 'No Support Cases'. Count churned customers in each category and calculate the churn rate. Return the support case classification, churn count, and churn rate. Order by the classification ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_case_facts", "stripe_enriched.int_stripe_churn_fact"],
    },
    # Test 19: Support volume vs customer value
    {
        "description": "Lifetime value correlated with support ticket count",
        "message": "Analyze lifetime value by support ticket volume. Left join Stripe customers to support cases on email. Group customers by ticket count ranges (0, 1-5, 6 or more). Calculate the average lifetime revenue for each range. Return ticket count range and average lifetime value. Order by ticket count range ascending.",
        "table_names": [
            "salesforce_enriched.int_salesforce_case_facts",
            "stripe_enriched.int_stripe_customers_dim",
        ],
    },
    # =============================================================================
    # REVENUE RECONCILIATION: STRIPE + QUICKBOOKS
    # =============================================================================
    # Test cases reconciling payment processing with accounting system.
    #
    # Examples:
    # - "Stripe revenue vs QuickBooks invoiced amounts"
    # - "Payment reconciliation across systems"
    # - "Revenue recognition timing differences"
    #
    # Business Domains: Stripe + QuickBooks
    # Join Keys: Customer email, time period
    # Expected Pattern: Revenue comparison and reconciliation
    # =============================================================================
    # Test 20: Cross-system revenue comparison
    {
        "description": "Stripe payments vs QuickBooks invoices",
        "message": "Compare total revenue between Stripe and QuickBooks. Sum MRR amounts from Stripe monthly revenue and sum revenue amounts from QuickBooks. Calculate the difference between the two totals. Return Stripe total revenue, QuickBooks total revenue, and the difference.",
        "table_names": [
            "stripe_enriched.int_stripe_monthly_revenue_fact",
            "quickbooks_enriched.int_quickbooks_revenue_facts",
        ],
    },
    # Test 21: Customer revenue reconciliation
    {
        "description": "Per-customer revenue reconciliation",
        "message": "Reconcile per-customer revenue between Stripe and QuickBooks. Full outer join Stripe and QuickBooks customers on email. Calculate the difference between Stripe and QuickBooks revenue for each customer, treating nulls as zero. Return email, Stripe revenue, QuickBooks revenue, and the difference. Order by the absolute value of the difference descending.",
        "table_names": [
            "stripe_enriched.int_stripe_customers_dim",
            "quickbooks_enriched.int_quickbooks_customer_dim",
        ],
    },
    # =============================================================================
    # OPERATIONAL EFFICIENCY: SHOPIFY + BREX
    # =============================================================================
    # Test cases analyzing operational costs relative to e-commerce revenue.
    #
    # Examples:
    # - "Operating expense ratio (expenses / revenue)"
    # - "Shipping costs vs order volume"
    # - "Fulfillment efficiency and costs"
    #
    # Business Domains: Shopify + Brex
    # Join Keys: Time period
    # Expected Pattern: Revenue vs operational cost analysis
    # =============================================================================
    # Test 22: Operating expense ratio
    {
        "description": "Operational costs as percentage of revenue",
        "message": "Calculate the operating expense ratio. Sum order totals from Shopify as revenue and sum expense amounts from Brex as expenses. Calculate the ratio as expenses divided by revenue, handling division by zero, expressed as a percentage. Return total revenue, total expenses, and operating expense ratio.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "brex_enriched.int_brex_expense_facts"],
    },
    # Test 23: Efficiency trend analysis
    {
        "description": "Monthly efficiency metrics",
        "message": "Calculate the monthly efficiency ratio. Aggregate Shopify revenue by calendar month and Brex expenses by calendar month. Combine using a full outer join on month. Calculate efficiency ratio as revenue divided by expenses, treating nulls as zero and handling division by zero. Return month, revenue, expenses, and efficiency ratio. Order by month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts", "brex_enriched.int_brex_expense_facts"],
    },
]
