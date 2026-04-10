"""Table metadata constants."""

from typing import Literal

from pydantic import BaseModel


class AssetMetadata(BaseModel):
    id: int


class TableMetadata(AssetMetadata):
    name: str
    display_name: str
    type: Literal["table"] = "table"


BENCHMARK_TABLES = [
    TableMetadata(name="brex_data.account", display_name="Account", id=205),
    TableMetadata(name="brex_data.card", display_name="Card", id=121),
    TableMetadata(name="brex_data.department", display_name="Department", id=66),
    TableMetadata(name="brex_data.expense", display_name="Expense", id=111),
    TableMetadata(name="brex_data.receipt", display_name="Receipt", id=208),
    TableMetadata(name="brex_data.statement", display_name="Statement", id=15),
    TableMetadata(name="brex_data.transaction", display_name="Transaction", id=173),
    TableMetadata(name="brex_data.transfer", display_name="Transfer", id=129),
    TableMetadata(name="brex_data.user", display_name="User", id=191),
    TableMetadata(name="calendly_data.event", display_name="Event", id=28),
    TableMetadata(name="calendly_data.event_membership", display_name="Event Membership", id=45),
    TableMetadata(name="calendly_data.event_type", display_name="Event Type", id=21),
    TableMetadata(name="calendly_data.invitee", display_name="Invitee", id=193),
    TableMetadata(name="calendly_data.invitee_question_answer", display_name="Invitee Question Answer", id=92),
    TableMetadata(name="calendly_data.organization", display_name="Organization", id=74),
    TableMetadata(name="calendly_data.routing_form", display_name="Routing Form", id=179),
    TableMetadata(name="calendly_data.routing_form_submission", display_name="Routing Form Submission", id=144),
    TableMetadata(name="calendly_data.user", display_name="User", id=164),
    TableMetadata(name="calendly_data.webhook_subscription", display_name="Webhook Subscription", id=14),
    TableMetadata(name="customerio_data.bounces", display_name="Bounces", id=23),
    TableMetadata(name="customerio_data.campaign", display_name="Campaign", id=130),
    TableMetadata(name="customerio_data.campaign_action", display_name="Campaign Action", id=17),
    TableMetadata(name="customerio_data.clicks", display_name="Clicks", id=186),
    TableMetadata(name="customerio_data.customer", display_name="Customer", id=189),
    TableMetadata(name="customerio_data.deliveries", display_name="Deliveries", id=159),
    TableMetadata(name="customerio_data.newsletter", display_name="Newsletter", id=60),
    TableMetadata(name="customerio_data.opens", display_name="Opens", id=155),
    TableMetadata(name="customerio_data.spam_complaints", display_name="Spam Complaints", id=108),
    TableMetadata(name="customerio_data.unsubscribes", display_name="Unsubscribes", id=37),
    TableMetadata(name="google_adwords_data.account", display_name="Account", id=161),
    TableMetadata(name="google_adwords_data.ad", display_name="Ad", id=178),
    TableMetadata(name="google_adwords_data.ad_group", display_name="Ad Group", id=70),
    TableMetadata(name="google_adwords_data.ad_group_stats", display_name="Ad Group Stats", id=135),
    TableMetadata(name="google_adwords_data.budget", display_name="Budget", id=64),
    TableMetadata(name="google_adwords_data.campaign", display_name="Campaign", id=180),
    TableMetadata(name="google_adwords_data.campaign_stats", display_name="Campaign Stats", id=152),
    TableMetadata(name="google_adwords_data.geographic_stats", display_name="Geographic Stats", id=75),
    TableMetadata(name="google_adwords_data.keyword", display_name="Keyword", id=194),
    TableMetadata(name="google_adwords_data.keyword_stats", display_name="Keyword Stats", id=55),
    TableMetadata(name="lever_data.application", display_name="Application", id=120),
    TableMetadata(name="lever_data.archive_reason", display_name="Archive Reason", id=102),
    TableMetadata(name="lever_data.feedback", display_name="Feedback", id=192),
    TableMetadata(name="lever_data.interview", display_name="Interview", id=25),
    TableMetadata(name="lever_data.offer", display_name="Offer", id=184),
    TableMetadata(name="lever_data.opportunity", display_name="Opportunity", id=154),
    TableMetadata(name="lever_data.posting", display_name="Posting", id=76),
    TableMetadata(name="lever_data.referral", display_name="Referral", id=210),
    TableMetadata(name="lever_data.stage", display_name="Stage", id=134),
    TableMetadata(name="lever_data.user", display_name="User", id=98),
    TableMetadata(name="linkedin_ads_data.account", display_name="Account", id=24),
    TableMetadata(name="linkedin_ads_data.account_user", display_name="Account User", id=148),
    TableMetadata(name="linkedin_ads_data.ad_analytics_by_campaign", display_name="Ad Analytics By Campaign", id=34),
    TableMetadata(name="linkedin_ads_data.ad_analytics_by_creative", display_name="Ad Analytics By Creative", id=207),
    TableMetadata(name="linkedin_ads_data.campaign", display_name="Campaign", id=162),
    TableMetadata(name="linkedin_ads_data.campaign_demographics", display_name="Campaign Demographics", id=26),
    TableMetadata(name="linkedin_ads_data.campaign_group", display_name="Campaign Group", id=171),
    TableMetadata(name="linkedin_ads_data.conversion", display_name="Conversion", id=96),
    TableMetadata(name="linkedin_ads_data.creative", display_name="Creative", id=43),
    TableMetadata(name="quickbooks_data.account", display_name="Account", id=146),
    TableMetadata(name="quickbooks_data.bill", display_name="Bill", id=46),
    TableMetadata(name="quickbooks_data.customer", display_name="Customer", id=158),
    TableMetadata(name="quickbooks_data.invoice", display_name="Invoice", id=200),
    TableMetadata(name="quickbooks_data.invoice_line", display_name="Invoice Line", id=91),
    TableMetadata(name="quickbooks_data.item", display_name="Item", id=183),
    TableMetadata(name="quickbooks_data.journal_entry", display_name="Journal Entry", id=181),
    TableMetadata(name="quickbooks_data.payment", display_name="Payment", id=172),
    TableMetadata(name="quickbooks_data.purchase", display_name="Purchase", id=68),
    TableMetadata(name="quickbooks_data.vendor", display_name="Vendor", id=86),
    TableMetadata(name="salesforce_data.account", display_name="Account", id=199),
    TableMetadata(name="salesforce_data.campaign", display_name="Campaign", id=103),
    TableMetadata(name="salesforce_data.case", display_name="Case", id=157),
    TableMetadata(name="salesforce_data.contact", display_name="Contact", id=97),
    TableMetadata(name="salesforce_data.event", display_name="Event", id=196),
    TableMetadata(name="salesforce_data.lead", display_name="Lead", id=166),
    TableMetadata(name="salesforce_data.opportunity", display_name="Opportunity", id=187),
    TableMetadata(name="salesforce_data.opportunity_history", display_name="Opportunity History", id=73),
    TableMetadata(name="salesforce_data.task", display_name="Task", id=33),
    TableMetadata(name="salesforce_data.user", display_name="User", id=50),
    TableMetadata(name="shopify_data.customer", display_name="Customer", id=127),
    TableMetadata(name="shopify_data.discount_code", display_name="Discount Code", id=117),
    TableMetadata(name="shopify_data.fulfillment", display_name="Fulfillment", id=118),
    TableMetadata(name="shopify_data.inventory_item", display_name="Inventory Item", id=132),
    TableMetadata(name="shopify_data.order", display_name="Order", id=133),
    TableMetadata(name="shopify_data.order_line", display_name="Order Line", id=116),
    TableMetadata(name="shopify_data.product", display_name="Product", id=101),
    TableMetadata(name="shopify_data.product_variant", display_name="Product Variant", id=190),
    TableMetadata(name="shopify_data.refund", display_name="Refund", id=198),
    TableMetadata(name="shopify_data.transaction", display_name="Transaction", id=72),
    TableMetadata(name="stripe_data.charge", display_name="Charge", id=30),
    TableMetadata(name="stripe_data.customer", display_name="Customer", id=78),
    TableMetadata(name="stripe_data.invoice", display_name="Invoice", id=31),
    TableMetadata(name="stripe_data.payment_intent", display_name="Payment Intent", id=206),
    TableMetadata(name="stripe_data.payment_method", display_name="Payment Method", id=82),
    TableMetadata(name="stripe_data.plan", display_name="Plan", id=115),
    TableMetadata(name="stripe_data.product", display_name="Product", id=125),
    TableMetadata(name="stripe_data.refund", display_name="Refund", id=32),
    TableMetadata(name="stripe_data.subscription", display_name="Subscription", id=128),
    TableMetadata(name="stripe_data.subscription_item", display_name="Subscription Item", id=211),
    TableMetadata(name="brex_enriched.int_brex_expense_facts", display_name="Int Brex Expense Facts", id=165),
    TableMetadata(
        name="brex_enriched.int_brex_spending_by_department_facts",
        display_name="Int Brex Spending By Department Facts",
        id=151,
    ),
    TableMetadata(name="brex_enriched.int_brex_transaction_facts", display_name="Int Brex Transaction Facts", id=27),
    TableMetadata(
        name="brex_enriched.int_brex_spending_by_user_facts",
        display_name="Int Brex Spending By User Facts",
        id=99,
    ),
    TableMetadata(
        name="calendly_enriched.int_calendly_booking_funnel_facts",
        display_name="Int Calendly Booking Funnel Facts",
        id=195,
    ),
    TableMetadata(
        name="calendly_enriched.int_calendly_invitee_facts", display_name="Int Calendly Invitee Facts", id=95
    ),
    TableMetadata(
        name="customerio_enriched.int_customerio_engagement_facts",
        display_name="Int Customerio Engagement Facts",
        id=83,
    ),
    TableMetadata(
        name="google_adwords_enriched.int_google_adwords_keyword_performance_facts",
        display_name="Int Google Adwords Keyword Performance Facts",
        id=19,
    ),
    TableMetadata(
        name="lever_enriched.int_lever_hiring_funnel_facts", display_name="Int Lever Hiring Funnel Facts", id=35
    ),
    TableMetadata(name="lever_enriched.int_lever_offer_facts", display_name="Int Lever Offer Facts", id=81),
    TableMetadata(
        name="linkedin_ads_enriched.int_linkedin_ads_creative_performance_facts",
        display_name="Int Linkedin Ads Creative Performance Facts",
        id=61,
    ),
    TableMetadata(
        name="quickbooks_enriched.int_quickbooks_invoice_facts", display_name="Int Quickbooks Invoice Facts", id=51
    ),
    TableMetadata(
        name="salesforce_enriched.int_salesforce_account_dim", display_name="Int Salesforce Account Dim", id=69
    ),
    TableMetadata(
        name="salesforce_enriched.int_salesforce_lead_conversion_facts",
        display_name="Int Salesforce Lead Conversion Facts",
        id=52,
    ),
    TableMetadata(
        name="salesforce_enriched.int_salesforce_opportunity_facts",
        display_name="Int Salesforce Opportunity Facts",
        id=126,
    ),
    TableMetadata(
        name="salesforce_enriched.int_salesforce_opportunity_stage_facts",
        display_name="Int Salesforce Opportunity Stage Facts",
        id=185,
    ),
    TableMetadata(name="shopify_enriched.int_shopify_customer_dim", display_name="Int Shopify Customer Dim", id=182),
    TableMetadata(name="shopify_enriched.int_shopify_order_facts", display_name="Int Shopify Order Facts", id=142),
    TableMetadata(
        name="shopify_enriched.int_shopify_order_line_facts", display_name="Int Shopify Order Line Facts", id=94
    ),
    TableMetadata(name="stripe_enriched.int_stripe_churn_fact", display_name="Int Stripe Churn Fact", id=87),
    TableMetadata(name="stripe_enriched.int_stripe_customers_dim", display_name="Int Stripe Customers Dim", id=202),
    TableMetadata(
        name="stripe_enriched.int_stripe_daily_revenue_fact", display_name="Int Stripe Daily Revenue Fact", id=145
    ),
    TableMetadata(
        name="stripe_enriched.int_stripe_monthly_revenue_fact", display_name="Int Stripe Monthly Revenue Fact", id=123
    ),
]


def get_benchmark_table(table_name: str) -> TableMetadata:
    for table in BENCHMARK_TABLES:
        if table.name == table_name:
            return table
    raise ValueError(f"Table {table_name} not found in benchmark entities.")
