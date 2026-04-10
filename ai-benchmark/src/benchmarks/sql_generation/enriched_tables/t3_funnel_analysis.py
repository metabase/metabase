"""
Tier 3: Funnel Analysis

This module tests the agent's ability to analyze multi-stage conversion funnels.

Funnel analysis tracks progression through sequential stages:
- How many entities enter each stage?
- What's the conversion rate between stages?
- Where are the biggest drop-offs?
- How do conversion rates vary by dimension (source, time period, etc.)?
"""

TEST_DATA = [
    # =============================================================================
    # LEVER - HIRING FUNNEL ANALYSIS
    # =============================================================================
    # Hiring funnel: Application -> Screen -> Interview -> Offer -> Hire
    #
    # Key metrics:
    # - Application-to-interview conversion rate
    # - Interview-to-offer conversion rate
    # - Overall hire rate
    # - Time-to-hire by stage
    # - Funnel performance by recruiter, department, or job posting
    #
    # Business Domains: Recruiting/ATS
    # Expected Pattern: Multi-stage progression analysis with conversion calculations
    # =============================================================================
    # Test 1: Basic funnel - count by stage
    {
        "description": "Candidate count at each hiring stage",
        "message": "Count candidates at each hiring funnel stage. Group by funnel stage and count the candidates in each stage. Return funnel stage and candidate count. Order by candidate count descending, using funnel stage ascending as a tiebreaker.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
                * The query should use the lever_enriched.int_lever_hiring_funnel_facts table
                * The query should group by funnel_stage
                * The query should count candidates in each stage using COUNT(*) or COUNT(opportunity_id)
                * The query should order by candidate count descending, then funnel_stage ascending as tiebreaker
                * The query should include funnel_stage and candidate count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT funnel_stage,
                       COUNT(*) as candidate_count
                FROM lever_enriched.int_lever_hiring_funnel_facts
                GROUP BY funnel_stage
                ORDER BY candidate_count DESC, funnel_stage ASC
                """,
    },
    # Test 2: Stage-to-stage conversion rates
    {
        "description": "Conversion rates between hiring stages",
        "message": "Calculate hiring funnel conversion rates. Sum interview counts divided by sum of application counts to get the application-to-interview rate. Sum offer counts divided by sum of interview counts to get the interview-to-offer rate. Handle division by zero. Round both rates to 2 decimal places. Return a single row with both conversion rates as percentages.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
                * The query should use the lever_enriched.int_lever_hiring_funnel_facts table
                * The query should calculate application to interview conversion rate using application_count and interview_count columns
                * The query should calculate interview to offer conversion rate using interview_count and offer_count columns
                * The query should aggregate across all candidates using SUM() on the count columns
                * The query should calculate conversion rates as percentages (interview_count / application_count * 100 and offer_count / interview_count * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round results to 2 decimal places
                * The query should return a single row with both conversion rates
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  ROUND(100.0 * SUM(interview_count) / NULLIF(SUM(application_count), 0), 2) as application_to_interview_rate,
                  ROUND(100.0 * SUM(offer_count) / NULLIF(SUM(interview_count), 0), 2) as interview_to_offer_rate
                FROM lever_enriched.int_lever_hiring_funnel_facts
                """,
    },
    # Test 3: Overall funnel efficiency
    {
        "description": "End-to-end hiring conversion rate",
        "message": "Calculate the overall hire rate. Count accepted offers (where is_accepted is true) from the offers table. Count total applicants from the applications table. Calculate hire rate as hires divided by total applicants, handling division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["lever_enriched.int_lever_application_facts", "lever_enriched.int_lever_offer_facts"],
        "query_description": """
                * The query should use lever_enriched.int_lever_application_facts to count total applicants
                * The query should use lever_enriched.int_lever_offer_facts to count hires (offers where is_accepted = true)
                * The query should calculate the hire rate as percentage (hires / applicants * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the hire rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  ROUND(100.0 * (SELECT COUNT(*) FROM lever_enriched.int_lever_offer_facts WHERE is_accepted = true)
                    / NULLIF((SELECT COUNT(*) FROM lever_enriched.int_lever_application_facts), 0), 2) as hire_rate_percentage
                """,
    },
    # Test 4: Funnel by posting
    {
        "description": "Hiring funnel breakdown by job posting",
        "message": "Calculate hiring funnel metrics by job posting. Count applications, offers, and accepted hires (where is_accepted is true) by posting. Combine using a full outer join on posting id. Calculate application-to-offer rate and application-to-hire rate as percentages, handling division by zero. Round to 2 decimal places. Return posting id, posting title, application count, offer count, hire count, and both conversion rates. Order by application count descending, using posting id ascending as a tiebreaker.",
        "table_names": ["lever_enriched.int_lever_application_facts", "lever_enriched.int_lever_offer_facts"],
        "query_description": """
                * The query should use lever_enriched.int_lever_application_facts to get application counts by posting
                * The query should use lever_enriched.int_lever_offer_facts to get offer counts and hire counts by posting
                * The query should join or combine the tables on posting_id
                * The query should group by posting_id and optionally posting_title
                * The query should count total applications per posting
                * The query should count total offers per posting
                * The query should count hires per posting (offers where is_accepted = true)
                * The query should calculate application-to-offer conversion rate as percentage
                * The query should calculate application-to-hire conversion rate as percentage
                * The query should handle division by zero using NULLIF or similar
                * The query should order by application count descending, then posting_id ascending as tiebreaker
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  COALESCE(a.posting_id, o.posting_id) as posting_id,
                  COALESCE(a.posting_title, o.posting_title) as posting_title,
                  COALESCE(a.application_count, 0) as application_count,
                  COALESCE(o.offer_count, 0) as offer_count,
                  COALESCE(o.hire_count, 0) as hire_count,
                  ROUND(100.0 * COALESCE(o.offer_count, 0) / NULLIF(COALESCE(a.application_count, 0), 0), 2) as app_to_offer_rate,
                  ROUND(100.0 * COALESCE(o.hire_count, 0) / NULLIF(COALESCE(a.application_count, 0), 0), 2) as app_to_hire_rate
                FROM (
                  SELECT posting_id, posting_title, COUNT(*) as application_count
                  FROM lever_enriched.int_lever_application_facts
                  GROUP BY posting_id, posting_title
                ) a
                FULL OUTER JOIN (
                  SELECT posting_id, posting_title,
                         COUNT(*) as offer_count,
                         SUM(CASE WHEN is_accepted THEN 1 ELSE 0 END) as hire_count
                  FROM lever_enriched.int_lever_offer_facts
                  GROUP BY posting_id, posting_title
                ) o ON a.posting_id = o.posting_id
                ORDER BY application_count DESC, posting_id ASC
                """,
    },
    # Test 5: Drop-off identification
    {
        "description": "Identify largest funnel drop-off stage",
        "message": "Identify the largest drop-off in the hiring funnel. First calculate totals for each stage by summing the count columns. Then calculate the drop-off between consecutive stages: applications minus interviews, interviews minus offers, and offers minus hires. Return each transition as from_stage, to_stage, and drop_off count. Order by drop-off descending to show the biggest losses first.",
        "table_names": ["lever_enriched.int_lever_hiring_funnel_facts"],
        "query_description": """
                * The query should use the lever_enriched.int_lever_hiring_funnel_facts table
                * The query should calculate stage-to-stage drop-offs using the count columns (application_count, interview_count, offer_count, is_hired)
                * The query should aggregate using SUM() on each count column to get totals across all candidates
                * The query should calculate drop-offs as the difference between consecutive stages:
                  - Application to Interview drop-off: SUM(application_count) - SUM(interview_count)
                  - Interview to Offer drop-off: SUM(interview_count) - SUM(offer_count)
                  - Offer to Hire drop-off: SUM(offer_count) - SUM(is_hired)
                * The query should identify which stage transition has the largest drop-off
                * The query should return the from_stage, to_stage, and drop-off count
                * The query should order by drop-off count descending
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                WITH stage_totals AS (
                  SELECT
                    SUM(application_count) as applications,
                    SUM(interview_count) as interviews,
                    SUM(offer_count) as offers,
                    SUM(is_hired) as hires
                  FROM lever_enriched.int_lever_hiring_funnel_facts
                ),
                drop_offs AS (
                  SELECT 'Applications' as from_stage, 'Interviews' as to_stage, applications - interviews as drop_off
                  FROM stage_totals
                  UNION ALL
                  SELECT 'Interviews' as from_stage, 'Offers' as to_stage, interviews - offers as drop_off
                  FROM stage_totals
                  UNION ALL
                  SELECT 'Offers' as from_stage, 'Hires' as to_stage, offers - hires as drop_off
                  FROM stage_totals
                )
                SELECT from_stage, to_stage, drop_off
                FROM drop_offs
                ORDER BY drop_off DESC
                """,
    },
    # Test 6: Offer acceptance rate
    {
        "description": "Offer-to-hire acceptance rate",
        "message": "Calculate the offer acceptance rate. Count how many offers were accepted (where is_accepted is true) versus total offers. Express as a percentage, handling division by zero. Round to 2 decimal places and return a single value.",
        "table_names": ["lever_enriched.int_lever_offer_facts"],
        "query_description": """
                * The query should use the lever_enriched.int_lever_offer_facts table
                * The query should count total offers using COUNT(*)
                * The query should count accepted offers using COUNT(*) FILTER (WHERE is_accepted = true) or SUM(CASE WHEN is_accepted THEN 1 ELSE 0 END)
                * The query should calculate acceptance rate as percentage (accepted / total * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the acceptance rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  ROUND(100.0 * COUNT(*) FILTER (WHERE is_accepted = true) / NULLIF(COUNT(*), 0), 2) as offer_acceptance_rate
                FROM lever_enriched.int_lever_offer_facts
                """,
    },
    # =============================================================================
    # CUSTOMER.IO - EMAIL ENGAGEMENT FUNNEL ANALYSIS
    # =============================================================================
    # Email engagement funnel: Delivered -> Opened -> Clicked
    #
    # Key metrics:
    # - Delivery-to-open conversion rate (open rate)
    # - Open-to-click conversion rate (click-through rate)
    # - Overall engagement funnel performance
    # - Campaign-specific engagement metrics
    #
    # Business Domains: Marketing Automation
    # Expected Pattern: Multi-stage email engagement analysis with conversion calculations
    # =============================================================================
    # Test 13: Basic email engagement funnel
    {
        "description": "Email funnel metrics from delivery to click",
        "message": "Show email engagement funnel metrics. Count total emails delivered, count how many were opened (where was_opened is true), and count how many were clicked (where was_clicked is true). Return a single row with the delivered, opened, and clicked counts.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
                * The query should use the customerio_enriched.int_customerio_engagement_facts table
                * The query should count total deliveries using COUNT(*)
                * The query should count total opens using COUNT(*) FILTER (WHERE was_opened = true) or SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)
                * The query should count total clicks using COUNT(*) FILTER (WHERE was_clicked = true) or SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)
                * The query should return a single row with three metrics: deliveries, opens, and clicks
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    COUNT(*) as delivered,
                    COUNT(*) FILTER (WHERE was_opened = true) as opened,
                    COUNT(*) FILTER (WHERE was_clicked = true) as clicked
                FROM customerio_enriched.int_customerio_engagement_facts
                """,
    },
    # Test 17: Email bounce rate
    {
        "description": "Email bounce rate",
        "message": "Calculate the email bounce rate. Count total bounces from the bounce table. Count total deliveries from the engagement table. Calculate bounce rate as bounces divided by deliveries, handling division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": [
            "customerio_enriched.int_customerio_bounce_facts",
            "customerio_enriched.int_customerio_engagement_facts",
        ],
        "query_description": """
                * The query should use customerio_enriched.int_customerio_bounce_facts to count bounced emails
                * The query should use customerio_enriched.int_customerio_engagement_facts to count total delivered emails
                * The query should calculate bounce rate as percentage (bounce_count / total_deliveries * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the bounce rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * (SELECT COUNT(*) FROM customerio_enriched.int_customerio_bounce_facts) /
                          NULLIF((SELECT COUNT(*) FROM customerio_enriched.int_customerio_engagement_facts), 0), 2) as bounce_rate_pct
                """,
    },
    # Test 18: Unsubscribe rate from email campaigns
    {
        "description": "Unsubscribe rate from email campaigns",
        "message": "Calculate the email unsubscribe rate. Count total unsubscribes from the unsubscribe table. Count total deliveries from the engagement table. Calculate unsubscribe rate as unsubscribes divided by deliveries, handling division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": [
            "customerio_enriched.int_customerio_unsubscribe_facts",
            "customerio_enriched.int_customerio_engagement_facts",
        ],
        "query_description": """
                * The query should use customerio_enriched.int_customerio_unsubscribe_facts to count unsubscribes
                * The query should use customerio_enriched.int_customerio_engagement_facts to count total delivered emails
                * The query should calculate unsubscribe rate as percentage (unsubscribe_count / total_deliveries * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the unsubscribe rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * (SELECT COUNT(*) FROM customerio_enriched.int_customerio_unsubscribe_facts) /
                          NULLIF((SELECT COUNT(*) FROM customerio_enriched.int_customerio_engagement_facts), 0), 2) as unsubscribe_rate_pct
                """,
    },
    # Test 14: Open rate calculation
    {
        "description": "Email open rate",
        "message": "Calculate the email open rate. Count emails that were opened (where was_opened is true) divided by total delivered emails. Handle division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
                * The query should use the customerio_enriched.int_customerio_engagement_facts table
                * The query should count total deliveries using COUNT(*)
                * The query should count total opens using COUNT(*) FILTER (WHERE was_opened = true) or SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)
                * The query should calculate open rate as percentage (opens / deliveries * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the open rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * COUNT(*) FILTER (WHERE was_opened = true) / NULLIF(COUNT(*), 0), 2) as open_rate_pct
                FROM customerio_enriched.int_customerio_engagement_facts
                """,
    },
    # Test 15: Click-through rate
    {
        "description": "Email click-through rate",
        "message": "Calculate the email click-through rate. Count emails that were clicked (where was_clicked is true) divided by emails that were opened (where was_opened is true). Handle division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["customerio_enriched.int_customerio_engagement_facts"],
        "query_description": """
                * The query should use the customerio_enriched.int_customerio_engagement_facts table
                * The query should count total opens using COUNT(*) FILTER (WHERE was_opened = true) or SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)
                * The query should count total clicks using COUNT(*) FILTER (WHERE was_clicked = true) or SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)
                * The query should calculate click-through rate as percentage (clicks / opens * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the click-through rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * COUNT(*) FILTER (WHERE was_clicked = true) / NULLIF(COUNT(*) FILTER (WHERE was_opened = true), 0), 2) as click_through_rate
                FROM customerio_enriched.int_customerio_engagement_facts
                """,
    },
    # Test 16: Funnel by campaign
    {
        "description": "Email engagement funnel by campaign",
        "message": "Calculate email engagement metrics by campaign. Join engagement data to campaign details on campaign id. Group by campaign id and name. Count delivered emails, count opened emails, and count clicked emails. Calculate open rate and click rate as percentages, handling division by zero. Round to 2 decimal places. Order by delivered count descending, using campaign id ascending as a tiebreaker.",
        "table_names": [
            "customerio_enriched.int_customerio_engagement_facts",
            "customerio_enriched.int_customerio_campaign_dim",
        ],
        "query_description": """
                * The query should use the customerio_enriched.int_customerio_engagement_facts table
                * The query should join to customerio_enriched.int_customerio_campaign_dim to get campaign_name
                * The query should group by campaign_id and campaign_name
                * The query should count total deliveries per campaign using COUNT(*)
                * The query should count total opens per campaign using COUNT(*) FILTER (WHERE was_opened = true) or SUM(CASE WHEN was_opened THEN 1 ELSE 0 END)
                * The query should count total clicks per campaign using COUNT(*) FILTER (WHERE was_clicked = true) or SUM(CASE WHEN was_clicked THEN 1 ELSE 0 END)
                * The query should calculate open rate as percentage (opens / deliveries * 100)
                * The query should calculate click rate as percentage (clicks / deliveries * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round percentage results to 2 decimal places
                * The query should order by delivered count descending, then campaign_id ascending as tiebreaker
                * The query should include campaign_id, campaign_name, delivered, opened, clicked, open_rate, and click_rate columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    c.campaign_id,
                    c.campaign_name,
                    COUNT(*) as delivered,
                    COUNT(*) FILTER (WHERE e.was_opened = true) as opened,
                    COUNT(*) FILTER (WHERE e.was_clicked = true) as clicked,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE e.was_opened = true) / NULLIF(COUNT(*), 0), 2) as open_rate,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE e.was_clicked = true) / NULLIF(COUNT(*), 0), 2) as click_rate
                FROM customerio_enriched.int_customerio_engagement_facts e
                JOIN customerio_enriched.int_customerio_campaign_dim c ON e.campaign_id = c.campaign_id
                GROUP BY c.campaign_id, c.campaign_name
                ORDER BY delivered DESC, c.campaign_id ASC
                """,
    },
    # =============================================================================
    # SALESFORCE - SALES PIPELINE FUNNEL ANALYSIS
    # =============================================================================
    # Sales funnel: Lead -> Qualified -> Opportunity -> Proposal -> Closed Won
    #
    # Key metrics:
    # - Lead-to-opportunity conversion rate
    # - Opportunity stage progression
    # - Win rate (Closed Won / All Closed)
    # - Pipeline velocity (time in each stage)
    # - Funnel by lead source, industry, sales rep
    # - Deal slippage and loss reasons
    #
    # Business Domains: CRM/Sales
    # Expected Pattern: Multi-stage sales progression with conversion and velocity
    # =============================================================================
    # Test 19: Lead conversion funnel
    {
        "description": "Lead-to-opportunity conversion rate",
        "message": "Calculate the lead-to-opportunity conversion rate. Sum the conversion counts and divide by total lead count. Handle division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["salesforce_enriched.int_salesforce_lead_conversion_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_lead_conversion_facts table
                * The query should count total leads using COUNT(*)
                * The query should count converted leads using SUM(conversion_count) or COUNT(*) FILTER (WHERE is_converted = true) or similar
                * The query should calculate conversion rate as percentage (converted / total * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the conversion rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * SUM(conversion_count) / NULLIF(COUNT(*), 0), 2) as lead_to_opportunity_conversion_rate
                FROM salesforce_enriched.int_salesforce_lead_conversion_facts
                """,
    },
    # Test 20: Opportunity stage distribution
    {
        "description": "Count of opportunities by stage",
        "message": "Count opportunities by pipeline stage. Group by stage name and count opportunities in each stage. Return stage name and opportunity count. Order by opportunity count descending, using stage name ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by stage_name
                * The query should count opportunities in each stage using COUNT(*) or COUNT(opportunity_id)
                * The query should order by opportunity count descending, then stage_name ascending as tiebreaker
                * The query should include stage_name and opportunity count columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    stage_name,
                    COUNT(*) as opportunity_count
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY stage_name
                ORDER BY opportunity_count DESC, stage_name ASC
                """,
    },
    # Test 21: Overall opportunity win rate
    {
        "description": "Overall opportunity win rate",
        "message": "Calculate the win rate for closed opportunities. Filter to only closed opportunities (where is_closed is true). Count won opportunities divided by total closed opportunities. Handle division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should filter to closed opportunities using is_closed = true
                * The query should count total closed opportunities using COUNT(*)
                * The query should count won opportunities using SUM(CASE WHEN is_won THEN 1 ELSE 0 END) or COUNT(*) FILTER (WHERE is_won = true)
                * The query should calculate win rate as percentage (won / total_closed * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the win rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  ROUND(100.0 * SUM(CASE WHEN is_won THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as win_rate_percentage
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE is_closed = true
                """,
    },
    # Test 22: Lead conversion rates by lead source
    {
        "description": "Lead conversion rates by lead source",
        "message": "Calculate lead conversion rate by lead source. Group by lead source. Count total leads and sum conversion counts for converted leads. Calculate conversion rate as converted divided by total, expressed as a percentage. Handle division by zero. Round to 2 decimal places. Order by total leads descending, using lead source ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_lead_conversion_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_lead_conversion_facts table
                * The query should group by lead_source
                * The query should count total leads per source using COUNT(*)
                * The query should count converted leads per source using SUM(conversion_count)
                * The query should calculate conversion rate as percentage (converted / total * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the conversion rate to 2 decimal places
                * The query should order by total leads descending, then lead_source ascending as tiebreaker
                * The query should include lead_source, total_leads, converted_leads, and conversion_rate columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  lead_source,
                  COUNT(*) as total_leads,
                  SUM(conversion_count) as converted_leads,
                  ROUND(100.0 * SUM(conversion_count) / NULLIF(COUNT(*), 0), 2) as conversion_rate
                FROM salesforce_enriched.int_salesforce_lead_conversion_facts
                GROUP BY lead_source
                ORDER BY total_leads DESC, lead_source ASC
                """,
    },
    # Test 23: Stage-to-stage conversion
    {
        "description": "Conversion rates between opportunity stages",
        "message": "Calculate stage-to-stage conversion rates for opportunities. Count transitions between stages, treating null previous stage as 'START'. Calculate the total opportunities leaving each stage, then compute the conversion rate as transitions divided by total from that stage. Round to 2 decimal places. Order by from_stage ascending, then to_stage ascending.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_stage_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_stage_facts table
                * The query should identify stage transitions using previous_stage and stage_name columns
                * The query should handle NULL previous_stage values (opportunities that started in a stage) using COALESCE or similar
                * The query should group by both from_stage (previous_stage) and to_stage (stage_name) to count transitions
                * The query should calculate total opportunities in each from_stage
                * The query should calculate conversion rate as percentage (transition_count / total_from_stage * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round conversion rates to 2 decimal places
                * The query should order by from_stage ascending, then to_stage ascending for deterministic results
                * The query should include from_stage, to_stage, transition_count, total_from_stage, and conversion_rate_pct columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                WITH stage_transitions AS (
                    SELECT
                        COALESCE(previous_stage, 'START') as from_stage,
                        stage_name as to_stage,
                        COUNT(*) as transition_count
                    FROM salesforce_enriched.int_salesforce_opportunity_stage_facts
                    GROUP BY previous_stage, stage_name
                ),
                from_stage_totals AS (
                    SELECT
                        from_stage,
                        SUM(transition_count) as total_from_stage
                    FROM stage_transitions
                    GROUP BY from_stage
                )
                SELECT
                    st.from_stage,
                    st.to_stage,
                    st.transition_count,
                    fst.total_from_stage,
                    ROUND(100.0 * st.transition_count / fst.total_from_stage, 2) as conversion_rate_pct
                FROM stage_transitions st
                JOIN from_stage_totals fst ON st.from_stage = fst.from_stage
                ORDER BY st.from_stage ASC, st.to_stage ASC
                """,
    },
    # Test 24: Win rate by industry
    {
        "description": "Opportunity win rates by industry",
        "message": "Calculate opportunity win rate by industry. Filter to only closed opportunities (where is_closed is true). Group by account industry. Count total closed and count won opportunities. Calculate win rate as won divided by total, expressed as a percentage. Handle division by zero. Round to 2 decimal places. Order by win rate descending, using account industry ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should filter to closed opportunities using is_closed = true
                * The query should group by account_industry
                * The query should count total closed opportunities per industry using COUNT(*)
                * The query should count won opportunities per industry using SUM(CASE WHEN is_won THEN 1 ELSE 0 END) or COUNT(*) FILTER (WHERE is_won = true)
                * The query should calculate win rate as percentage (won / total_closed * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the win rate to 2 decimal places
                * The query should order by win rate descending, then account_industry ascending as tiebreaker
                * The query should include account_industry, total_closed_opportunities, won_opportunities, and win_rate columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    account_industry,
                    COUNT(*) as total_closed_opportunities,
                    SUM(CASE WHEN is_won THEN 1 ELSE 0 END) as won_opportunities,
                    ROUND(100.0 * SUM(CASE WHEN is_won THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as win_rate
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                WHERE is_closed = true
                GROUP BY account_industry
                ORDER BY win_rate DESC, account_industry ASC
                """,
    },
    # Test 25: Pipeline value by stage
    {
        "description": "Total opportunity value at each pipeline stage",
        "message": "Calculate total pipeline value by opportunity stage. Group by stage name and sum the opportunity amounts. Return stage name and total value. Order by total value descending, using stage name ascending as a tiebreaker.",
        "table_names": ["salesforce_enriched.int_salesforce_opportunity_facts"],
        "query_description": """
                * The query should use the salesforce_enriched.int_salesforce_opportunity_facts table
                * The query should group by stage_name
                * The query should aggregate the total dollar value using SUM(opportunity_amount)
                * The query should order by total value descending, then stage_name ascending as tiebreaker
                * The query should include stage_name and total value columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT stage_name,
                       SUM(opportunity_amount) as total_value
                FROM salesforce_enriched.int_salesforce_opportunity_facts
                GROUP BY stage_name
                ORDER BY total_value DESC, stage_name ASC
                """,
    },
    # =============================================================================
    # CALENDLY - BOOKING FUNNEL ANALYSIS
    # =============================================================================
    # Booking funnel: View -> Routing Form -> Scheduled -> Attended
    #
    # Key metrics:
    # - View-to-schedule conversion rate
    # - Schedule-to-attendance rate (no-show rate)
    # - Routing form completion impact
    # - Conversion by event type
    # - Time-to-booking metrics
    #
    # Business Domains: Meeting Scheduling
    # Expected Pattern: Multi-stage booking progression with conversion analysis
    # =============================================================================
    # Test 9: No-show rate analysis
    {
        "description": "Meeting attendance rate",
        "message": "Calculate the meeting no-show rate. Count meetings where booking status is 'Completed' and invitee status is 'canceled' as no-shows. Divide by total completed meetings, handling division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": ["calendly_enriched.int_calendly_invitee_facts"],
        "query_description": """
                * The query should use the calendly_enriched.int_calendly_invitee_facts table
                * The query should identify completed meetings where booking_status = 'Completed'
                * The query should identify no-shows as meetings where booking_status = 'Completed' AND invitee_status = 'canceled'
                * The query should identify attended meetings as meetings where booking_status = 'Completed' AND invitee_status = 'active'
                * The query should calculate no-show rate as percentage (no_shows / total_completed_meetings * 100)
                * The query should use COUNT with FILTER or CASE WHEN to count different categories
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the no-show rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                  ROUND(100.0 * COUNT(*) FILTER (WHERE booking_status = 'Completed' AND invitee_status = 'canceled') /
                    NULLIF(COUNT(*) FILTER (WHERE booking_status = 'Completed'), 0), 2) as no_show_rate
                FROM calendly_enriched.int_calendly_invitee_facts
                """,
    },
    # Test 11: Funnel by event type
    {
        "description": "Booking funnel performance by event type",
        "message": "Calculate booking funnel metrics by event type. Group by event type name. Sum total bookings, active bookings, and canceled bookings. Calculate cancellation rate as canceled divided by total, and completion rate as active divided by total. Express as percentages, handling division by zero. Round to 2 decimal places. Order by total bookings descending, using event type name ascending as a tiebreaker.",
        "table_names": ["calendly_enriched.int_calendly_booking_funnel_facts"],
        "query_description": """
                * The query should use the calendly_enriched.int_calendly_booking_funnel_facts table
                * The query should group by event_type_name
                * The query should aggregate total_bookings, active_bookings, and canceled_bookings using SUM
                * The query should calculate cancellation rate as percentage (canceled_bookings / total_bookings * 100)
                * The query should calculate completion rate as percentage (active_bookings / total_bookings * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round percentage results to 2 decimal places
                * The query should order by total bookings descending, then event_type_name ascending as tiebreaker
                * The query should include event_type_name, total_bookings, active_bookings, canceled_bookings, cancellation_rate, and completion_rate columns
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    event_type_name,
                    SUM(total_bookings) as total_bookings,
                    SUM(active_bookings) as active_bookings,
                    SUM(canceled_bookings) as canceled_bookings,
                    ROUND(100.0 * SUM(canceled_bookings) / NULLIF(SUM(total_bookings), 0), 2) as cancellation_rate,
                    ROUND(100.0 * SUM(active_bookings) / NULLIF(SUM(total_bookings), 0), 2) as completion_rate
                FROM calendly_enriched.int_calendly_booking_funnel_facts
                GROUP BY event_type_name
                ORDER BY total_bookings DESC, event_type_name ASC
                """,
    },
    # Test 12: Cancellation analysis
    {
        "description": "Meeting cancellation rate",
        "message": "Calculate the overall meeting cancellation rate. Count total cancellations from the cancellation table. Count total scheduled meetings from the invitee table. Calculate cancellation rate as cancellations divided by total scheduled, handling division by zero. Round to 2 decimal places and return a single value as a percentage.",
        "table_names": [
            "calendly_enriched.int_calendly_cancellation_facts",
            "calendly_enriched.int_calendly_invitee_facts",
        ],
        "query_description": """
                * The query should use calendly_enriched.int_calendly_cancellation_facts to count canceled meetings
                * The query should use calendly_enriched.int_calendly_invitee_facts to count total scheduled meetings
                * The query should calculate cancellation rate as percentage (canceled_count / total_scheduled * 100)
                * The query should handle division by zero using NULLIF or similar
                * The query should round the result to 2 decimal places
                * The query should return a single row with the cancellation rate percentage
                * The query should be of type 'SQL' (not MBQL)
                """,
        "reference_query": """
                SELECT
                    ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM calendly_enriched.int_calendly_invitee_facts), 0), 2) as cancellation_rate_pct
                FROM calendly_enriched.int_calendly_cancellation_facts
                """,
    },
]
