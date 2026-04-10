"""
Tier 2: Calculated Metrics SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
calculated/derived metrics:
- Ratios and percentages (CTR, conversion rates)
- Division with null handling
- Comparative metrics (vs benchmarks, averages)
- Multi-step calculations
"""

# Test 1: Google AdWords CTR by campaign
google_adwords_ctr_by_campaign = {
    "description": "Google AdWords CTR by campaign",
    "message": "What is the click-through rate for each AdWords campaign by date? Join campaign stats to campaign tables. Calculate CTR as clicks divided by impressions times 100, handling division by zero. Return campaign name, date, and CTR percentage. Order by campaign name ascending, then date ascending.",
    "table_names": ["google_adwords_data.campaign_stats", "google_adwords_data.campaign"],
    "query_description": """
* The query should use google_adwords_data.campaign_stats and google_adwords_data.campaign tables
* The query should join campaign to campaign_stats on campaign_id
* The query should calculate click-through rate as (clicks / impressions * 100)
* The query should handle division by zero (return 0 or use NULLIF)
* The query should include campaign name, date, and CTR percentage
* The query should order by campaign name and date
    """,
    "reference_query": """
SELECT c.name,
       cs.date,
       CASE WHEN cs.impressions > 0
            THEN (cs.clicks::numeric / cs.impressions * 100)
            ELSE 0
       END as ctr_percent
FROM google_adwords_data.campaign_stats cs
JOIN google_adwords_data.campaign c ON cs.campaign_id = c.id
ORDER BY c.name, cs.date
    """,
}

# Test 2: LinkedIn ad creatives with highest CTR
linkedin_ad_creatives_highest_ctr = {
    "description": "LinkedIn ad creatives with highest CTR",
    "message": "Which LinkedIn ad creatives have the highest click-through rate? Join ad analytics by creative to creative tables. Calculate CTR as total clicks divided by total impressions times 100, handling division by zero. Return creative id and CTR percentage. Order by CTR descending, using creative id ascending as a tiebreaker.",
    "table_names": ["linkedin_ads_data.ad_analytics_by_creative", "linkedin_ads_data.creative"],
    "query_description": """
* The query should use linkedin_ads_data.ad_analytics_by_creative and linkedin_ads_data.creative tables
* The query should join creative to ad_analytics_by_creative on creative_id
* The query should group by creative (GROUP BY creative.id)
* The query should calculate CTR as (SUM(clicks) / SUM(impressions) * 100)
* The query should handle division by zero using NULLIF
* The query should include creative ID and CTR percentage
* The query should order by CTR descending, creative ID ascending as tiebreaker
    """,
    "reference_query": """
SELECT cr.id,
       SUM(aa.clicks)::numeric / NULLIF(SUM(aa.impressions), 0) * 100 as ctr_percent
FROM linkedin_ads_data.ad_analytics_by_creative aa
JOIN linkedin_ads_data.creative cr ON aa.creative_id = cr.id
GROUP BY cr.id
ORDER BY ctr_percent DESC, cr.id ASC
    """,
}

# Test 3: Customer.io email delivery vs bounce rate
customerio_email_delivery_vs_bounce_rate = {
    "description": "Customer.io email delivery vs bounce rate",
    "message": "What is the Customer.io email delivery vs bounce rate? Count all records from the deliveries table as delivered count, and count all records from the bounces table as bounced count. Calculate delivery rate as delivered count divided by the sum of delivered count plus bounced count, times 100, handling division by zero. Return delivered count, bounced count, and delivery rate percentage as a single row.",
    "table_names": ["customerio_data.deliveries", "customerio_data.bounces"],
    "query_description": """
* The query should use customerio_data.deliveries and customerio_data.bounces tables
* The query should count all records (rows) from deliveries table using COUNT(*)
* The query should count all records (rows) from bounces table using COUNT(*)
* The query should calculate delivery rate percentage as (deliveries / (deliveries + bounces) * 100)
* The query should handle division by zero using NULLIF
* The query should return delivered count, bounced count, and delivery rate percentage
    """,
    "reference_query": """
SELECT
    (SELECT COUNT(*) FROM customerio_data.deliveries) as delivered,
    (SELECT COUNT(*) FROM customerio_data.bounces) as bounced,
    (SELECT COUNT(*) FROM customerio_data.deliveries)::numeric /
    NULLIF((SELECT COUNT(*) FROM customerio_data.deliveries) + (SELECT COUNT(*) FROM customerio_data.bounces), 0) * 100 as delivery_rate_percent
    """,
}

# Test 4: QuickBooks invoice collection rate
quickbooks_invoice_collection_rate = {
    "description": "Percentage of QuickBooks invoice amounts collected",
    "message": "What is the QuickBooks invoice collection rate? Sum amounts for collected invoices (where balance equals zero) divided by the total sum of all amounts, times 100, handling division by zero. Return the collection rate percentage as a single value.",
    "table_names": ["quickbooks_data.invoice"],
    "query_description": """
* The query should use quickbooks_data.invoice table
* The query should calculate the collection rate percentage
* The query should sum total_amt where balance = 0 (collected invoices)
* The query should divide by the total sum of all total_amt values
* The query should handle division by zero using NULLIF
* The query should multiply by 100 to get percentage
    """,
    "reference_query": """
SELECT
    SUM(CASE WHEN balance = 0 THEN total_amt ELSE 0 END) / NULLIF(SUM(total_amt), 0) * 100 as collection_rate_percent
FROM quickbooks_data.invoice
    """,
}

# Test 5: Candidates with interviews vs offers
candidates_with_interviews_vs_offers = {
    "description": "Candidates with interviews vs offers",
    "message": "How many Lever candidates have had interviews vs how many offers have been made? Count distinct candidates from the interview table and count total offers from the offer table. Return both counts as a single row.",
    "table_names": ["lever_data.interview", "lever_data.offer"],
    "query_description": """
* The query should use lever_data.interview and lever_data.offer tables
* The query should count distinct opportunity_id from interview table (candidates with interviews)
* The query should count total rows from offer table (offers made)
* The query should return both counts in a single result row
    """,
    "reference_query": """
SELECT
    (SELECT COUNT(DISTINCT opportunity_id) FROM lever_data.interview) as candidates_with_interviews,
    (SELECT COUNT(*) FROM lever_data.offer) as offers_made
    """,
}

# Test 6: Calendly routing form conversion rate
calendly_routing_form_conversion_rate = {
    "description": "Routing form submission to booking conversion rate",
    "message": "What is the Calendly routing form conversion rate? Count submissions that resulted in booked events (where result event type uri is not null) divided by total submissions, times 100, handling division by zero. Return the conversion rate percentage as a single value.",
    "table_names": ["calendly_data.routing_form_submission"],
    "query_description": """
* The query should use calendly_data.routing_form_submission table
* The query should calculate the conversion rate percentage
* The query should count rows where result_event_type_uri IS NOT NULL (booked events)
* The query should divide by the total count of all rows
* The query should handle division by zero using NULLIF
* The query should multiply by 100 to get percentage
    """,
    "reference_query": """
SELECT
    SUM(CASE WHEN result_event_type_uri IS NOT NULL THEN 1 ELSE 0 END)::numeric /
    NULLIF(COUNT(*), 0) * 100 as conversion_rate_percent
FROM calendly_data.routing_form_submission
    """,
}

# Test 7: Average order value for Shopify orders
shopify_average_order_value = {
    "description": "Average order value for Shopify orders",
    "message": "What is the average order value for Shopify orders? Calculate as total price sum divided by order count, handling division by zero. Return the average order value as a single value.",
    "table_names": ["shopify_data.order"],
    "query_description": """
* The query should use shopify_data.order table
* The query should calculate average order value as SUM(total_price) / COUNT(*)
* The query should handle division by zero using NULLIF
* The query should return a single value for the average order value
    """,
    "reference_query": """
SELECT SUM(total_price) / NULLIF(COUNT(*), 0) as avg_order_value
FROM shopify_data.order
    """,
}

# Test 8: Opportunity win rate by industry segment
opportunity_win_rate_by_industry = {
    "description": "Opportunity win rate by industry segment",
    "message": "What is the opportunity win rate by industry in Salesforce? Join opportunity to account tables. Calculate win rate as the count of won opportunities divided by total opportunities, times 100, handling division by zero. Return industry and win rate percentage. Order by industry name ascending.",
    "table_names": ["salesforce_data.opportunity", "salesforce_data.account"],
    "query_description": """
* The query should use salesforce_data.opportunity and salesforce_data.account tables
* The query should join opportunity to account on account_id
* The query should group by industry (GROUP BY account.industry)
* The query should calculate win rate as (count of won opportunities / total count * 100)
* The query should use is_won = true or similar to identify won opportunities
* The query should handle division by zero using NULLIF
* The query should order by industry name
    """,
    "reference_query": """
SELECT a.industry,
       SUM(CASE WHEN o.is_won = true THEN 1 ELSE 0 END)::numeric /
       NULLIF(COUNT(*), 0) * 100 as win_rate_percent
FROM salesforce_data.opportunity o
JOIN salesforce_data.account a ON o.account_id = a.id
GROUP BY a.industry
ORDER BY a.industry
    """,
}

# Test 9: Average Brex transaction amount by merchant
brex_average_transaction_by_merchant = {
    "description": "Average Brex transaction amount by merchant",
    "message": "What is the average Brex transaction amount by merchant? Group by merchant name and calculate the average amount. Return merchant name and average amount. Order by average descending, using merchant name ascending as a tiebreaker.",
    "table_names": ["brex_data.transaction"],
    "query_description": """
* The query should use brex_data.transaction table
* The query should group by merchant_name
* The query should calculate AVG(amount) for each merchant
* The query should include merchant_name and average transaction amount
* The query should order by average transaction amount descending, merchant_name ascending as tiebreaker
    """,
    "reference_query": """
SELECT merchant_name,
       AVG(amount) as avg_transaction_amount
FROM brex_data.transaction
GROUP BY merchant_name
ORDER BY avg_transaction_amount DESC, merchant_name ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    google_adwords_ctr_by_campaign,
    linkedin_ad_creatives_highest_ctr,
    customerio_email_delivery_vs_bounce_rate,
    quickbooks_invoice_collection_rate,
    candidates_with_interviews_vs_offers,
    calendly_routing_form_conversion_rate,
    shopify_average_order_value,
    opportunity_win_rate_by_industry,
    brex_average_transaction_by_merchant,
]
