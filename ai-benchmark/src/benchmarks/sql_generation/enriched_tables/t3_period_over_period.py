"""
Tier 3: Period-over-Period Comparisons

This module tests the agent's ability to perform temporal comparisons,
comparing metrics across different time periods (month-over-month, year-over-year, etc.).
"""

TEST_DATA = [
    # =============================================================================
    # MONTH-OVER-MONTH COMPARISONS
    # =============================================================================
    # 1. Stripe - MoM MRR growth
    {
        "description": "Month-over-month MRR growth rate",
        "message": "Show month-over-month growth in MRR. For each month, calculate the total monthly recurring revenue and compare it to the previous month using a window function. Calculate the growth rate as a percentage, handling division by zero. Return the month, current MRR, previous month's MRR, and growth percentage. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should aggregate MRR by month (GROUP BY month_start_date or similar)
                * The query should use a window function (LAG) or self-join to compare each month to the previous month
                * The query should calculate the growth rate as (current_mrr - previous_mrr) / previous_mrr
                * The query should order by month_start_date ascending
                * The query should handle NULL values appropriately (the first month will have no previous month)
                """,
        "reference_query": """
                WITH monthly_mrr AS (
                    SELECT
                        month_start_date,
                        SUM(mrr_amount) as total_mrr
                    FROM stripe_enriched.int_stripe_monthly_revenue_fact
                    GROUP BY month_start_date
                )
                SELECT
                    month_start_date,
                    total_mrr,
                    LAG(total_mrr) OVER (ORDER BY month_start_date) as previous_month_mrr,
                    (total_mrr - LAG(total_mrr) OVER (ORDER BY month_start_date)) / NULLIF(LAG(total_mrr) OVER (ORDER BY month_start_date), 0) * 100 as growth_rate_pct
                FROM monthly_mrr
                ORDER BY month_start_date ASC
                """,
    },
    # 2. Shopify - MoM order volume change
    {
        "description": "Month-over-month change in order count",
        "message": "Show month-over-month change in order count. Count orders by calendar month and compare each month to the previous month using a window function. Calculate the absolute change between months. Return the month, order count, previous month's count, and the change. Order by month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should group orders by month (using order_date or similar date field)
                * The query should count orders per month
                * The query should use a window function (LAG) or self-join to get the previous month's order count
                * The query should calculate the change as current_count - previous_count
                * The query should order by month ascending
                * The query should handle NULL values appropriately (the first month will have no previous month)
                """,
        "reference_query": """
                WITH monthly_counts AS (
                    SELECT
                        DATE_TRUNC('month', order_date)::date as order_month,
                        COUNT(*) as order_count
                    FROM shopify_enriched.int_shopify_order_facts
                    GROUP BY DATE_TRUNC('month', order_date)::date
                )
                SELECT
                    order_month,
                    order_count,
                    LAG(order_count) OVER (ORDER BY order_month) as previous_month_count,
                    order_count - LAG(order_count) OVER (ORDER BY order_month) as mom_change
                FROM monthly_counts
                ORDER BY order_month ASC
                """,
    },
    # 3. Google AdWords - MoM spend changes
    {
        "description": "Month-over-month advertising spend changes",
        "message": "Show month-over-month change in AdWords spend. Sum ad costs by calendar month and compare each month to the previous month using a window function. Calculate both the absolute change and percentage change, handling division by zero. Return the month, total cost, previous month's cost, change amount, and change percentage. Order by month ascending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should aggregate cost by month (GROUP BY month from performance_date)
                * The query should use a window function (LAG) or self-join to compare each month to the previous month
                * The query should calculate the month-over-month change in cost (current_cost - previous_cost)
                * The query should optionally calculate the percentage change
                * The query should order by month ascending
                * The query should handle NULL values appropriately (the first month will have no previous month)
                """,
        "reference_query": """
                WITH monthly_spend AS (
                    SELECT
                        DATE_TRUNC('month', performance_date)::date as month,
                        SUM(cost) as total_cost
                    FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                    GROUP BY DATE_TRUNC('month', performance_date)::date
                )
                SELECT
                    month,
                    total_cost,
                    LAG(total_cost) OVER (ORDER BY month) as previous_month_cost,
                    total_cost - LAG(total_cost) OVER (ORDER BY month) as mom_change,
                    (total_cost - LAG(total_cost) OVER (ORDER BY month)) / NULLIF(LAG(total_cost) OVER (ORDER BY month), 0) * 100 as mom_change_pct
                FROM monthly_spend
                ORDER BY month ASC
                """,
    },
    # =============================================================================
    # YEAR-OVER-YEAR COMPARISONS
    # =============================================================================
    # 4. Stripe - YoY MRR growth
    {
        "description": "Year-over-year MRR growth comparison",
        "message": "Show year-over-year MRR growth for each month. Sum MRR by month and compare each month to the same month one year prior using a 12-period offset window function. Calculate both the absolute change and percentage change, handling division by zero. Include all months in the output, showing NULL for prior year values and change calculations when no prior year data exists. Return the month, current MRR, prior year's MRR, change amount, and change percentage. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should aggregate MRR by month (GROUP BY month_start_date or similar)
                * The query should use a window function (LAG with 12-month offset) or self-join to compare each month to the same month in the previous year
                * The query should calculate the year-over-year change as (current_year_mrr - previous_year_mrr)
                * The query should calculate the percentage change
                * The query should order by month_start_date ascending
                * The query should include all months, with NULL values for prior year and change columns when no prior year data exists
                """,
        "reference_query": """
                WITH monthly_mrr AS (
                    SELECT
                        month_start_date,
                        SUM(mrr_amount) as total_mrr
                    FROM stripe_enriched.int_stripe_monthly_revenue_fact
                    GROUP BY month_start_date
                )
                SELECT
                    month_start_date,
                    total_mrr,
                    LAG(total_mrr, 12) OVER (ORDER BY month_start_date) as previous_year_mrr,
                    total_mrr - LAG(total_mrr, 12) OVER (ORDER BY month_start_date) as yoy_change,
                    (total_mrr - LAG(total_mrr, 12) OVER (ORDER BY month_start_date)) / NULLIF(LAG(total_mrr, 12) OVER (ORDER BY month_start_date), 0) * 100 as yoy_change_pct
                FROM monthly_mrr
                ORDER BY month_start_date ASC
                """,
    },
    # 5. Salesforce - YoY pipeline growth
    {
        "description": "Year-over-year opportunity pipeline growth",
        "message": "Compare opportunity pipeline value to the same month last year. Sum opportunity amounts by calendar month based on close date, then compare each month to the same month one year prior using a 12-period offset window function. Calculate both the absolute change and percentage change, handling division by zero. Include all months in the output, showing NULL for prior year values and change calculations when no prior year data exists. Return the month, current pipeline value, prior year's pipeline, change amount, and change percentage. Order by month ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should aggregate opportunity pipeline by month (GROUP BY using close_date or similar date field)
                * The query should use a window function (LAG with 12-month offset) or self-join to compare each month to the same month in the previous year
                * The query should calculate the year-over-year change in pipeline (current_year_pipeline - previous_year_pipeline)
                * The query should calculate the percentage change
                * The query should order by month ascending
                * The query should include all months, with NULL values for prior year and change columns when no prior year data exists
                """,
        "reference_query": """
                WITH monthly_pipeline AS (
                    SELECT
                        DATE_TRUNC('month', close_date)::date as close_month,
                        SUM(opportunity_amount) as total_pipeline
                    FROM salesforce_enriched.int_salesforce_opportunity_facts
                    GROUP BY DATE_TRUNC('month', close_date)::date
                )
                SELECT
                    close_month,
                    total_pipeline,
                    LAG(total_pipeline, 12) OVER (ORDER BY close_month) as previous_year_pipeline,
                    total_pipeline - LAG(total_pipeline, 12) OVER (ORDER BY close_month) as yoy_change,
                    (total_pipeline - LAG(total_pipeline, 12) OVER (ORDER BY close_month)) / NULLIF(LAG(total_pipeline, 12) OVER (ORDER BY close_month), 0) * 100 as yoy_change_pct
                FROM monthly_pipeline
                ORDER BY close_month ASC
                """,
    },
    # 6. Shopify - YoY revenue comparison
    {
        "description": "Year-over-year revenue growth by month",
        "message": "Show year-over-year net revenue growth for each month, excluding cancelled orders. Sum net_revenue by calendar month and compare each month to the same month one year prior using a 12-period offset window function. Calculate both the absolute change and percentage change, handling division by zero. Return the month, current revenue, prior year's revenue, change amount, and change percentage. Order by month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should exclude cancelled orders (is_cancelled = false or NOT is_cancelled)
                * The query should aggregate net_revenue by month (GROUP BY using order_date or similar date field)
                * The query should use a window function (LAG with 12-month offset) or self-join to compare each month to the same month in the previous year
                * The query should calculate the year-over-year change in revenue (current_year_revenue - previous_year_revenue)
                * The query should optionally calculate the percentage change
                * The query should order by month ascending
                * The query should handle NULL values appropriately (months in the first year will have no previous year comparison)
                """,
        "reference_query": """
                WITH monthly_revenue AS (
                    SELECT
                        DATE_TRUNC('month', order_date)::date as order_month,
                        SUM(net_revenue) as total_revenue
                    FROM shopify_enriched.int_shopify_order_facts
                    WHERE NOT is_cancelled
                    GROUP BY DATE_TRUNC('month', order_date)::date
                )
                SELECT
                    order_month,
                    total_revenue,
                    LAG(total_revenue, 12) OVER (ORDER BY order_month) as previous_year_revenue,
                    total_revenue - LAG(total_revenue, 12) OVER (ORDER BY order_month) as yoy_change,
                    (total_revenue - LAG(total_revenue, 12) OVER (ORDER BY order_month)) / NULLIF(LAG(total_revenue, 12) OVER (ORDER BY order_month), 0) * 100 as yoy_change_pct
                FROM monthly_revenue
                ORDER BY order_month ASC
                """,
    },
    # =============================================================================
    # QUARTER-OVER-QUARTER COMPARISONS
    # =============================================================================
    # 8. Salesforce - QoQ opportunity creation
    {
        "description": "Quarter-over-quarter change in opportunity creation",
        "message": "Show quarter-over-quarter change in opportunities created. Count opportunities by calendar quarter, excluding those with null created dates. Compare each quarter to the previous quarter using a window function. Calculate both the absolute change and percentage change, handling division by zero. Return the quarter start date, opportunity count, previous quarter's count, absolute change, and percentage change. Order by quarter ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group opportunities by quarter (using created_date or similar date field)
                * The query should count opportunities created per quarter
                * The query should use a window function (LAG) or self-join to get the previous quarter's opportunity count
                * The query should calculate the quarter-over-quarter change as current_count - previous_count
                * The query should optionally calculate the percentage change
                * The query should order by quarter ascending
                * The query should handle NULL values appropriately (the first quarter will have no previous quarter)
                """,
        "reference_query": """
                WITH quarterly_opps AS (
                    SELECT
                        DATE_TRUNC('quarter', created_date)::date as quarter_start,
                        COUNT(*) as opportunities_created
                    FROM salesforce_enriched.int_salesforce_opportunity_facts
                    WHERE created_date IS NOT NULL
                    GROUP BY DATE_TRUNC('quarter', created_date)::date
                )
                SELECT
                    quarter_start,
                    opportunities_created,
                    LAG(opportunities_created) OVER (ORDER BY quarter_start) as previous_quarter,
                    opportunities_created - LAG(opportunities_created) OVER (ORDER BY quarter_start) as qoq_change,
                    (opportunities_created - LAG(opportunities_created) OVER (ORDER BY quarter_start))::numeric / NULLIF(LAG(opportunities_created) OVER (ORDER BY quarter_start), 0) * 100 as qoq_change_pct
                FROM quarterly_opps
                ORDER BY quarter_start ASC
                """,
    },
    # 9. Shopify - QoQ customer acquisition
    {
        "description": "Quarter-over-quarter customer growth",
        "message": "Show quarter-over-quarter change in customer acquisition. Count customers by calendar quarter based on their creation date, excluding null values. Compare each quarter to the previous quarter using a window function. Calculate both the absolute change and percentage change, handling division by zero. Return the quarter start date, customers acquired, previous quarter's count, absolute change, and percentage change. Order by quarter ascending.",
        "table_names": ["shopify_enriched.int_shopify_customer_dim"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_customer_dim table
                * The query should group customers by quarter (using customer_created_at or similar date field)
                * The query should count customers acquired per quarter
                * The query should use a window function (LAG) or self-join to get the previous quarter's customer count
                * The query should calculate the quarter-over-quarter change as current_count - previous_count
                * The query should optionally calculate the percentage change
                * The query should order by quarter ascending
                * The query should handle NULL values appropriately (the first quarter will have no previous quarter)
                """,
        "reference_query": """
                WITH quarterly_customers AS (
                    SELECT
                        DATE_TRUNC('quarter', customer_created_at)::date as quarter_start,
                        COUNT(*) as customers_acquired
                    FROM shopify_enriched.int_shopify_customer_dim
                    WHERE customer_created_at IS NOT NULL
                    GROUP BY DATE_TRUNC('quarter', customer_created_at)::date
                )
                SELECT
                    quarter_start,
                    customers_acquired,
                    LAG(customers_acquired) OVER (ORDER BY quarter_start) as previous_quarter,
                    customers_acquired - LAG(customers_acquired) OVER (ORDER BY quarter_start) as qoq_change,
                    (customers_acquired - LAG(customers_acquired) OVER (ORDER BY quarter_start))::numeric / NULLIF(LAG(customers_acquired) OVER (ORDER BY quarter_start), 0) * 100 as qoq_change_pct
                FROM quarterly_customers
                ORDER BY quarter_start ASC
                """,
    },
    # =============================================================================
    # ROLLING WINDOW METRICS
    # =============================================================================
    # 10. Stripe - 3-month rolling average MRR
    {
        "description": "Three-month rolling average of MRR",
        "message": "Show the 3-month rolling average of MRR. First calculate total MRR per month, then compute a rolling average over the current month and two preceding months. Return the month, monthly MRR, and rolling average. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_monthly_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_monthly_revenue_fact table
                * The query should aggregate MRR by month (GROUP BY month_start_date or similar)
                * The query should use a window function with ROWS BETWEEN 2 PRECEDING AND CURRENT ROW or equivalent frame specification
                * The query should calculate the rolling average using AVG() over the window
                * The query should order by month_start_date ascending
                * The query should include month_start_date, total MRR for each month, and the 3-month rolling average
                """,
        "reference_query": """
                WITH monthly_mrr AS (
                    SELECT
                        month_start_date,
                        SUM(mrr_amount) as total_mrr
                    FROM stripe_enriched.int_stripe_monthly_revenue_fact
                    GROUP BY month_start_date
                )
                SELECT
                    month_start_date,
                    total_mrr,
                    AVG(total_mrr) OVER (
                        ORDER BY month_start_date
                        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
                    ) as rolling_3mo_avg
                FROM monthly_mrr
                ORDER BY month_start_date ASC
                """,
    },
    # 11. Google AdWords - 30-day trailing total ad spend
    {
        "description": "30-day trailing total ad spend",
        "message": "Show the trailing 30-day total AdWords spend. First aggregate daily cost totals, then calculate a rolling sum over the current day and 29 preceding days. Return the date, daily cost, and trailing 30-day total. Order by date descending.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should aggregate cost by day (GROUP BY performance_date or similar date field)
                * The query should use a window function with ROWS BETWEEN 29 PRECEDING AND CURRENT ROW or equivalent frame specification for a 30-day window
                * The query should calculate the trailing sum using SUM() over the window
                * The query should order by performance_date descending
                * The query should include performance_date, daily cost, and the 30-day trailing total
                """,
        "reference_query": """
                WITH daily_spend AS (
                    SELECT
                        performance_date,
                        SUM(cost) as total_cost
                    FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                    GROUP BY performance_date
                )
                SELECT
                    performance_date,
                    total_cost,
                    SUM(total_cost) OVER (
                        ORDER BY performance_date
                        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
                    ) as trailing_30day_total
                FROM daily_spend
                ORDER BY performance_date DESC
                """,
    },
    # 12. Shopify - 7-day moving average orders
    {
        "description": "Seven-day moving average of daily orders",
        "message": "Show the 7-day moving average of daily order volume. Count orders by day, excluding null order dates. Calculate a rolling average over the current day and 6 preceding days. Return the day, daily order count, and 7-day rolling average. Order by day ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should aggregate orders by day (GROUP BY order_date truncated to day)
                * The query should use a window function with ROWS BETWEEN 6 PRECEDING AND CURRENT ROW or equivalent frame specification for a 7-day window
                * The query should calculate the rolling average using AVG() over the window
                * The query should order by order_date ascending
                * The query should include order_date (day), daily order count, and the 7-day rolling average
                """,
        "reference_query": """
                WITH daily_orders AS (
                    SELECT
                        DATE_TRUNC('day', order_date)::date as order_day,
                        COUNT(*) as daily_order_count
                    FROM shopify_enriched.int_shopify_order_facts
                    WHERE order_date IS NOT NULL
                    GROUP BY DATE_TRUNC('day', order_date)::date
                )
                SELECT
                    order_day,
                    daily_order_count,
                    AVG(daily_order_count) OVER (
                        ORDER BY order_day
                        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                    ) as rolling_7day_avg
                FROM daily_orders
                ORDER BY order_day ASC
                """,
    },
    # 13. Stripe - 12-month rolling total revenue
    {
        "description": "Trailing twelve-month revenue",
        "message": "Show the trailing 12-month total revenue for each month. First aggregate net revenue by calendar month, then calculate a rolling sum over the current month and 11 preceding months. Return the month, monthly revenue, and trailing 12-month revenue. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should aggregate revenue by month (GROUP BY revenue_date truncated to month)
                * The query should use a window function with ROWS BETWEEN 11 PRECEDING AND CURRENT ROW or equivalent frame specification for a 12-month window
                * The query should calculate the trailing sum using SUM() over the window
                * The query should order by month ascending
                * The query should include month, monthly revenue, and the trailing 12-month total
                * The query should use net_revenue or gross_revenue field for revenue calculation
                """,
        "reference_query": """
                WITH monthly_revenue AS (
                    SELECT
                        DATE_TRUNC('month', revenue_date)::date as month_start,
                        SUM(net_revenue) as total_revenue
                    FROM stripe_enriched.int_stripe_daily_revenue_fact
                    GROUP BY DATE_TRUNC('month', revenue_date)::date
                )
                SELECT
                    month_start,
                    total_revenue,
                    SUM(total_revenue) OVER (
                        ORDER BY month_start
                        ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
                    ) as trailing_12mo_revenue
                FROM monthly_revenue
                ORDER BY month_start ASC
                """,
    },
    # =============================================================================
    # GROWTH RATE CALCULATIONS
    # =============================================================================
    # 14. Stripe - Monthly growth rate trend
    {
        "description": "Monthly growth rate for MRR",
        "message": "Calculate the monthly growth rate of revenue. Sum net revenue by calendar month and compare each month to the previous month using a window function. Calculate the growth rate as a percentage, handling division by zero. Return the month, total revenue, previous month's revenue, and growth percentage. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should aggregate revenue by month (GROUP BY revenue_date truncated to month)
                * The query should use a window function (LAG) or self-join to compare each month to the previous month
                * The query should calculate the growth rate as (current_revenue - previous_revenue) / previous_revenue * 100
                * The query should order by month ascending
                * The query should handle NULL values appropriately (the first month will have no previous month)
                * The query should use net_revenue or gross_revenue field for revenue calculation
                """,
        "reference_query": """
                WITH monthly_revenue AS (
                    SELECT
                        DATE_TRUNC('month', revenue_date)::date as month_start,
                        SUM(net_revenue) as total_revenue
                    FROM stripe_enriched.int_stripe_daily_revenue_fact
                    GROUP BY DATE_TRUNC('month', revenue_date)::date
                )
                SELECT
                    month_start,
                    total_revenue,
                    LAG(total_revenue) OVER (ORDER BY month_start) as previous_month_revenue,
                    (total_revenue - LAG(total_revenue) OVER (ORDER BY month_start)) / NULLIF(LAG(total_revenue) OVER (ORDER BY month_start), 0) * 100 as growth_rate_pct
                FROM monthly_revenue
                ORDER BY month_start ASC
                """,
    },
    # 15. Shopify - Revenue growth rate by month
    {
        "description": "Month-over-month revenue growth percentage",
        "message": "Show the percentage growth rate in revenue for each month, excluding cancelled orders. Sum total_price by calendar month and compare each month to the previous month using a window function. Calculate the growth rate as a percentage, handling division by zero. Return the month, total revenue, previous month's revenue, and growth percentage. Order by month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should exclude cancelled orders (is_cancelled = false or NOT is_cancelled)
                * The query should aggregate revenue by month (GROUP BY order_date truncated to month)
                * The query should use a window function (LAG) or self-join to compare each month to the previous month
                * The query should calculate the percentage growth rate as (current_revenue - previous_revenue) / previous_revenue * 100
                * The query should order by month ascending
                * The query should handle NULL values appropriately (the first month will have no previous month)
                * The query should sum total_price to calculate revenue
                """,
        "reference_query": """
                WITH monthly_revenue AS (
                    SELECT
                        DATE_TRUNC('month', order_date)::date as order_month,
                        SUM(total_price) as total_revenue
                    FROM shopify_enriched.int_shopify_order_facts
                    WHERE NOT is_cancelled
                    GROUP BY DATE_TRUNC('month', order_date)::date
                )
                SELECT
                    order_month,
                    total_revenue,
                    LAG(total_revenue) OVER (ORDER BY order_month) as previous_month_revenue,
                    (total_revenue - LAG(total_revenue) OVER (ORDER BY order_month)) / NULLIF(LAG(total_revenue) OVER (ORDER BY order_month), 0) * 100 as growth_rate_pct
                FROM monthly_revenue
                ORDER BY order_month ASC
                """,
    },
    # 16. Salesforce - Identify periods with highest opportunity growth
    {
        "description": "Identify periods with highest opportunity growth",
        "message": "Find the months with highest percentage growth in opportunity creation. Count opportunities by calendar month, excluding null created dates. Compare each month to the previous month using a window function. Calculate the growth percentage, handling division by zero. Return the month, opportunity count, previous month's count, and growth percentage. Order by growth percentage descending with nulls last, using month ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group opportunities by month (using created_date or similar date field)
                * The query should count opportunities created per month
                * The query should use a window function (LAG) or self-join to get the previous month's opportunity count
                * The query should calculate the percentage growth as (current_count - previous_count) / previous_count * 100
                * The query should order by percentage growth descending, with month ascending as tiebreaker
                * The query should handle NULL values appropriately (the first month will have no previous month)
                * The query should exclude or handle months where the previous month had zero opportunities
                """,
        "reference_query": """
                WITH monthly_counts AS (
                    SELECT
                        DATE_TRUNC('month', created_date)::date as created_month,
                        COUNT(*) as opportunity_count
                    FROM salesforce_enriched.int_salesforce_opportunity_facts
                    WHERE created_date IS NOT NULL
                    GROUP BY DATE_TRUNC('month', created_date)::date
                )
                SELECT
                    created_month,
                    opportunity_count,
                    LAG(opportunity_count) OVER (ORDER BY created_month) as previous_month_count,
                    (opportunity_count - LAG(opportunity_count) OVER (ORDER BY created_month))::numeric / NULLIF(LAG(opportunity_count) OVER (ORDER BY created_month), 0) * 100 as pct_growth
                FROM monthly_counts
                ORDER BY pct_growth DESC NULLS LAST, created_month ASC
                """,
    },
    # =============================================================================
    # CUMULATIVE METRICS
    # =============================================================================
    # 17. Stripe - Cumulative MRR over time
    {
        "description": "Running total of MRR by month",
        "message": "Show cumulative revenue over time. Sum net revenue by calendar month, then calculate a running total from the beginning of time through each month. Return the month, monthly revenue, and cumulative revenue. Order by month ascending.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should aggregate revenue by month (GROUP BY revenue_date truncated to month)
                * The query should use a window function with ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW or equivalent
                * The query should calculate the cumulative sum using SUM() over the window
                * The query should order by month ascending
                * The query should include month, monthly revenue, and cumulative revenue
                * The query should use net_revenue or gross_revenue field for revenue calculation
                """,
        "reference_query": """
                WITH monthly_revenue AS (
                    SELECT
                        DATE_TRUNC('month', revenue_date)::date as month_start,
                        SUM(net_revenue) as total_revenue
                    FROM stripe_enriched.int_stripe_daily_revenue_fact
                    GROUP BY DATE_TRUNC('month', revenue_date)::date
                )
                SELECT
                    month_start,
                    total_revenue,
                    SUM(total_revenue) OVER (ORDER BY month_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as cumulative_revenue
                FROM monthly_revenue
                ORDER BY month_start ASC
                """,
    },
    # 18. Shopify - Year-to-date revenue
    {
        "description": "Cumulative revenue within each year",
        "message": "Show year-to-date revenue for each month, resetting at the start of each year. Sum order totals by calendar month, grouped by year. Calculate a cumulative sum within each year from the beginning through the current month. Return the month, year, monthly revenue, and year-to-date revenue. Order by year then month ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should aggregate revenue by month using the order_month and order_year columns
                * The query should use a window function partitioned by year with ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                * The query should calculate the cumulative sum using SUM() over the window within each year
                * The query should order by year then month ascending
                * The query should include month, year, monthly revenue, and year-to-date revenue
                * The query should sum total_price to calculate revenue
                * The cumulative sum should reset at the beginning of each year
                """,
        "reference_query": """
                SELECT
                    order_month,
                    order_year,
                    SUM(total_price) as monthly_revenue,
                    SUM(SUM(total_price)) OVER (
                        PARTITION BY order_year
                        ORDER BY order_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) as ytd_revenue
                FROM shopify_enriched.int_shopify_order_facts
                GROUP BY order_year, order_month
                ORDER BY order_year, order_month ASC
                """,
    },
    # 19. Salesforce - Running total of customers acquired
    {
        "description": "Cumulative customer count over time",
        "message": "Show the running total of customers acquired over time. Count customers by calendar month based on account creation date, excluding null values. Calculate a cumulative sum from the beginning of time through each month. Return the month, customers acquired that month, and running total. Order by month ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_account_dim"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_account_dim table
                * The query should group customers by month (using account_created_date truncated to month)
                * The query should count customers acquired per month
                * The query should use a window function with ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW or equivalent
                * The query should calculate the running total using SUM() over the window
                * The query should order by month ascending
                * The query should include month, monthly customer count, and running total
                * The query should filter out NULL account_created_date values
                """,
        "reference_query": """
                WITH customer_counts AS (
                    SELECT
                        DATE_TRUNC('month', account_created_date)::date as created_month,
                        COUNT(*) as customers_acquired
                    FROM salesforce_enriched.int_salesforce_account_dim
                    WHERE account_created_date IS NOT NULL
                    GROUP BY DATE_TRUNC('month', account_created_date)::date
                )
                SELECT
                    created_month,
                    customers_acquired,
                    SUM(customers_acquired) OVER (
                        ORDER BY created_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) as running_total
                FROM customer_counts
                ORDER BY created_month ASC
                """,
    },
    # =============================================================================
    # COMPARATIVE PERIOD ANALYSIS
    # =============================================================================
    # 20. Stripe - Quarterly performance comparison
    {
        "description": "Side-by-side quarterly revenue comparison",
        "message": "Compare revenue across all quarters. Extract the year and quarter from the revenue date to group results. Sum net revenue for each quarter. Return the year, quarter, and total revenue. Order by year ascending, then quarter ascending.",
        "table_names": ["stripe_enriched.int_stripe_daily_revenue_fact"],
        "query_description": """
                * The query should use the stripe_enriched.int_stripe_daily_revenue_fact table
                * The query should extract year and quarter from revenue_date
                * The query should group by year and quarter
                * The query should sum net_revenue or gross_revenue to get total revenue per quarter
                * The query should order by year ascending and quarter ascending
                * The query should show each quarter's revenue side-by-side for comparison
                """,
        "reference_query": """
                SELECT
                    EXTRACT(YEAR FROM revenue_date) as year,
                    EXTRACT(QUARTER FROM revenue_date) as quarter,
                    SUM(net_revenue) as total_revenue
                FROM stripe_enriched.int_stripe_daily_revenue_fact
                GROUP BY EXTRACT(YEAR FROM revenue_date), EXTRACT(QUARTER FROM revenue_date)
                ORDER BY year ASC, quarter ASC
                """,
    },
    # 21. Shopify - Seasonal revenue patterns
    {
        "description": "Revenue by month to identify seasonal patterns",
        "message": "Show revenue by month to identify seasonal patterns. Extract the month number from order dates to group all years together. Sum the order totals for revenue and count the number of orders. Return the month number, total revenue, and order count. Order by month number ascending.",
        "table_names": ["shopify_enriched.int_shopify_order_facts"],
        "query_description": """
                * The query should use the shopify_enriched.int_shopify_order_facts table
                * The query should extract the month from order_date
                * The query should group by month
                * The query should sum total_price to get total revenue per month
                * The query should optionally include order count or month name for context
                * The query should order by month number ascending
                * The query should show revenue for each month to enable seasonal pattern analysis
                """,
        "reference_query": """
                SELECT
                    EXTRACT(MONTH FROM order_date) as month_number,
                    SUM(total_price) as total_revenue,
                    COUNT(*) as order_count
                FROM shopify_enriched.int_shopify_order_facts
                GROUP BY EXTRACT(MONTH FROM order_date)
                ORDER BY month_number ASC
                """,
    },
    # 22. Salesforce - First half vs. second half comparison
    {
        "description": "H1 vs. H2 opportunity creation comparison",
        "message": "Compare opportunity creation in first half vs second half of each year. Exclude opportunities with null created dates. Classify each opportunity as H1 (months 1-6) or H2 (months 7-12) based on the creation month. Count opportunities grouped by year and half. Return the year, half designation, and opportunity count. Order by year ascending, then half ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should extract the year from created_date
                * The query should classify each opportunity as H1 (months 1-6) or H2 (months 7-12) based on the month from created_date
                * The query should group by year and half (H1/H2)
                * The query should count opportunities created in each half
                * The query should order by year ascending, then half ascending
                * The query should filter out NULL created_date values
                """,
        "reference_query": """
                SELECT
                    EXTRACT(YEAR FROM created_date) as year,
                    CASE WHEN EXTRACT(MONTH FROM created_date) <= 6 THEN 'H1' ELSE 'H2' END as half,
                    COUNT(*) as opportunities_created
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE created_date IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM created_date),
                         CASE WHEN EXTRACT(MONTH FROM created_date) <= 6 THEN 'H1' ELSE 'H2' END
                ORDER BY year ASC, half ASC
                """,
    },
    # 23. Google AdWords - Monthly spend comparison across years
    {
        "description": "Compare same months across different years",
        "message": "Show ad spend for each month across all years to compare trends. Extract year and month number from performance dates to group results. Sum the cost for each year-month combination. Return the year, month number, and total spend. Order by month ascending, then year ascending to compare the same months across years.",
        "table_names": ["google_adwords_enriched.int_google_adwords_keyword_performance_facts"],
        "query_description": """
                * The query should use the google_adwords_enriched.int_google_adwords_keyword_performance_facts table
                * The query should extract year and month from performance_date
                * The query should group by year and month
                * The query should sum the cost to get total ad spend per month per year
                * The query should order by month number ascending, then year ascending
                * This allows comparing the same month across different years to identify trends
                """,
        "reference_query": """
                SELECT
                    EXTRACT(YEAR FROM performance_date) as year,
                    EXTRACT(MONTH FROM performance_date) as month,
                    SUM(cost) as total_spend
                FROM google_adwords_enriched.int_google_adwords_keyword_performance_facts
                GROUP BY EXTRACT(YEAR FROM performance_date), EXTRACT(MONTH FROM performance_date)
                ORDER BY month ASC, year ASC
                """,
    },
]
