"""
Tier 2: String Operations SQL Generation Tests

This module tests the agent's ability to construct SQL queries involving
string manipulation:
- Pattern matching (LIKE, ILIKE)
- String concatenation
- Substring extraction
- Case transformations (UPPER, LOWER)
- String aggregation
"""

# Test 1: Email domain analysis (SPLIT_PART string function)
email_domain_analysis = {
    "description": "Count Stripe customers by email domain",
    "message": "How many Stripe customers are there by email domain? Extract the domain from each email address (the part after the @ symbol). Return domain and customer count. Order by count descending, using domain ascending as a tiebreaker.",
    "table_names": ["stripe_data.customer"],
    "query_description": """
* The query should use stripe_data.customer table
* The query should extract the email domain using SPLIT_PART(email, '@', 2) or equivalent string function
* The query should group by the email domain
* The query should count customers per domain
* The query should order by customer count descending, then by domain name ascending as tiebreaker
* The query should include email domain and customer count columns
    """,
    "reference_query": """
SELECT
  SPLIT_PART(email, '@', 2) as email_domain,
  COUNT(*) as customer_count
FROM stripe_data.customer
GROUP BY email_domain
ORDER BY customer_count DESC, email_domain ASC
    """,
}

# Test 2: Name concatenation (|| operator)
name_concatenation = {
    "description": "Display full names for Salesforce contacts",
    "message": "Show Salesforce contacts with their full names. Concatenate first name and last name with a space between them. Return id, first name, last name, full name, and email. Order by last name ascending, using first name ascending as a tiebreaker.",
    "table_names": ["salesforce_data.contact"],
    "query_description": """
* The query should use salesforce_data.contact table
* The query should concatenate first_name and last_name with a space between them
* The query should include id, first_name, last_name, full_name, and email columns
* The query should order by last_name ascending, then first_name ascending
    """,
    "reference_query": """
SELECT
  id,
  first_name,
  last_name,
  first_name || ' ' || last_name as full_name,
  email
FROM salesforce_data.contact
ORDER BY last_name, first_name
    """,
}

# Test 3: Pattern matching with LIKE
pattern_matching_with_like = {
    "description": "Find products with specific keywords",
    "message": "Which Shopify products contain 'premium' or 'deluxe' in the title? Search case-insensitively. Return id, title, and product type. Order by title ascending, using id ascending as a tiebreaker.",
    "table_names": ["shopify_data.product"],
    "query_description": """
* The query should use shopify_data.product table
* The query should filter for products where title contains 'premium' or 'deluxe' (case-insensitive)
* The query should include id, title, and product_type columns
* The query should order by title ascending, then by id ascending as tiebreaker
    """,
    "reference_query": """
SELECT
  id,
  title,
  product_type
FROM shopify_data.product
WHERE LOWER(title) LIKE '%premium%' OR LOWER(title) LIKE '%deluxe%'
ORDER BY title ASC, id ASC
    """,
}

# Test 4: Case-insensitive grouping
case_insensitive_grouping = {
    "description": "Count opportunities by stage regardless of case",
    "message": "Count Salesforce opportunities by stage, ignoring case differences. Normalize stage names to uppercase. Return normalized stage name and opportunity count. Order by count descending, using normalized stage name ascending as a tiebreaker.",
    "table_names": ["salesforce_data.opportunity"],
    "query_description": """
* The query should use salesforce_data.opportunity table
* The query should normalize stage_name to uppercase (or lowercase) for grouping
* The query should group by the normalized stage name
* The query should count opportunities per stage
* The query should order by opportunity count descending, then by normalized stage name ascending as tiebreaker
* The query should include normalized stage name and opportunity count columns
    """,
    "reference_query": """
SELECT
  UPPER(stage_name) as stage_name_normalized,
  COUNT(*) as opportunity_count
FROM salesforce_data.opportunity
GROUP BY UPPER(stage_name)
ORDER BY opportunity_count DESC, stage_name_normalized ASC
    """,
}

# Test 5: String aggregation with joins
string_aggregation_with_joins = {
    "description": "List all contact emails by account",
    "message": "List Salesforce accounts with their contact emails aggregated into a comma-separated list. Left join account to contact tables to include accounts without contacts. Order the emails alphabetically within each account. Return account id, name, and contact emails. Order by account name ascending.",
    "table_names": ["salesforce_data.account", "salesforce_data.contact"],
    "query_description": """
* The query should use salesforce_data.account and salesforce_data.contact tables
* The query should join account to contact on account.id = contact.account_id
* The query should use LEFT JOIN to include accounts without contacts
* The query should group by account (GROUP BY account.id, account.name)
* The query should aggregate contact emails into a comma-separated list using STRING_AGG
* The query should order the emails within the aggregation alphabetically
* The query should order results by account name ascending
* The query should include account id, account name, and contact_emails columns
    """,
    "reference_query": """
SELECT
  a.id,
  a.name,
  STRING_AGG(c.email, ', ' ORDER BY c.email) as contact_emails
FROM salesforce_data.account a
LEFT JOIN salesforce_data.contact c ON a.id = c.account_id
GROUP BY a.id, a.name
ORDER BY a.name
    """,
}

# Test 6: Substring extraction
substring_extraction = {
    "description": "Extract first letter from product titles",
    "message": "Group Shopify products by the first letter of their title. Extract the first character from each title. Return first letter and product count. Order by first letter ascending.",
    "table_names": ["shopify_data.product"],
    "query_description": """
* The query should use shopify_data.product table
* The query should extract the first letter of title using SUBSTRING(title, 1, 1) or equivalent function
* The query should group by the first letter
* The query should count products per first letter
* The query should order by first letter ascending
* The query should include first letter and product count columns
    """,
    "reference_query": """
SELECT
  SUBSTRING(title, 1, 1) as first_letter,
  COUNT(*) as product_count
FROM shopify_data.product
GROUP BY first_letter
ORDER BY first_letter ASC
    """,
}

# Test 7: Company and type concatenation with COALESCE
company_type_concatenation_coalesce = {
    "description": "Display account name with type",
    "message": "Show Salesforce accounts with a combined name and type description. Concatenate as 'name (type)' format, using 'Unknown' when type is null. Return id, name, type, and account description. Order by name ascending.",
    "table_names": ["salesforce_data.account"],
    "query_description": """
* The query should use salesforce_data.account table
* The query should concatenate name and type into a single description field
* The query should handle NULL type values using COALESCE or equivalent, replacing with 'Unknown'
* The query should format as 'name (type)' pattern
* The query should include id, name, type, and the account_description columns
* The query should order by name ascending
    """,
    "reference_query": """
SELECT
  id,
  name,
  type,
  name || ' (' || COALESCE(type, 'Unknown') || ')' as account_description
FROM salesforce_data.account
ORDER BY name ASC
    """,
}

# Test 8: Pattern filtering with LIKE
pattern_filtering_with_like = {
    "description": "Find customers with .com email domains",
    "message": "Which Stripe customers have .com email domains? Filter for emails ending in .com. Return id, name, and email. Order by email ascending.",
    "table_names": ["stripe_data.customer"],
    "query_description": """
* The query should use stripe_data.customer table
* The query should filter for emails ending in .com using LIKE '%.com' or equivalent pattern matching
* The query should include id, name, and email columns
* The query should order by email ascending
    """,
    "reference_query": """
SELECT
  id,
  name,
  email
FROM stripe_data.customer
WHERE email LIKE '%.com'
ORDER BY email ASC
    """,
}

# Export test data and metadata for benchmark creation
TEST_DATA = [
    email_domain_analysis,
    name_concatenation,
    pattern_matching_with_like,
    case_insensitive_grouping,
    string_aggregation_with_joins,
    substring_extraction,
    company_type_concatenation_coalesce,
    pattern_filtering_with_like,
]
