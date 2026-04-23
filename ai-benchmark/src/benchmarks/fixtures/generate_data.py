"""
Generate fake data for all schemas using Factory Boy factories.

This script creates realistic test data for 10 SaaS platform schemas.
Run this after the database schemas and tables have been created.

DATA RANGE: January 1, 2022 - December 31, 2024 (3 years)
============================================================
All date fields in the generated data fall within this predictable range,
allowing you to write test cases with known time periods.

Examples of queries you can test:
- "Show me all orders from 2023"
- "What was our revenue in Q4 2024?"
- "Compare sales between 2022 and 2023"
- "Show me customers who signed up in the last 6 months" (relative to Dec 31, 2024)

The date range is configured in:
src/benchmarks/fixtures/factories/_shared_constants.py
"""

import random
from datetime import date, timedelta

# Import all factories
from src.benchmarks.fixtures.factories.brex import (
    BrexAccountFactory,
    BrexCardFactory,
    BrexDepartmentFactory,
    BrexExpenseFactory,
    BrexReceiptFactory,
    BrexStatementFactory,
    BrexTransactionFactory,
    BrexTransferFactory,
    BrexUserFactory,
)
from src.benchmarks.fixtures.factories.calendly import (
    CalendlyEventFactory,
    CalendlyEventInviteeFactory,
    CalendlyEventMembershipFactory,
    CalendlyEventTypeFactory,
    CalendlyInviteeQuestionAnswerFactory,
    CalendlyOrganizationFactory,
    CalendlyRoutingFormFactory,
    CalendlyRoutingFormSubmissionFactory,
    CalendlyUserFactory,
    CalendlyWebhookSubscriptionFactory,
)
from src.benchmarks.fixtures.factories.customerio import (
    CustomerioBouncesFactory,
    CustomerioCampaignActionFactory,
    CustomerioCampaignFactory,
    CustomerioClicksFactory,
    CustomerioCustomerFactory,
    CustomerioDeliveriesFactory,
    CustomerioNewsletterFactory,
    CustomerioOpensFactory,
    CustomerioSpamComplaintsFactory,
    CustomerioUnsubscribesFactory,
)
from src.benchmarks.fixtures.factories.google_adwords import (
    GoogleAdsAccountFactory,
    GoogleAdsAdFactory,
    GoogleAdsAdGroupFactory,
    GoogleAdsAdGroupStatsFactory,
    GoogleAdsBudgetFactory,
    GoogleAdsCampaignFactory,
    GoogleAdsCampaignStatsFactory,
    GoogleAdsGeographicStatsFactory,
    GoogleAdsKeywordFactory,
    GoogleAdsKeywordStatsFactory,
)
from src.benchmarks.fixtures.factories.lever import (
    LeverApplicationFactory,
    LeverArchiveReasonFactory,
    LeverFeedbackFactory,
    LeverInterviewFactory,
    LeverOfferFactory,
    LeverOpportunityFactory,
    LeverPostingFactory,
    LeverReferralFactory,
    LeverStageFactory,
    LeverUserFactory,
)
from src.benchmarks.fixtures.factories.linkedin_ads import (
    LinkedInAdsAccountFactory,
    LinkedInAdsAccountUserFactory,
    LinkedInAdsAdAnalyticsByCampaignFactory,
    LinkedInAdsAdAnalyticsByCreativeFactory,
    LinkedInAdsCampaignDemographicsFactory,
    LinkedInAdsCampaignFactory,
    LinkedInAdsCampaignGroupFactory,
    LinkedInAdsConversionFactory,
    LinkedInAdsCreativeFactory,
)
from src.benchmarks.fixtures.factories.quickbooks import (
    QuickBooksAccountFactory,
    QuickBooksBillFactory,
    QuickBooksCustomerFactory,
    QuickBooksInvoiceFactory,
    QuickBooksInvoiceLineFactory,
    QuickBooksItemFactory,
    QuickBooksJournalEntryFactory,
    QuickBooksPaymentFactory,
    QuickBooksPurchaseFactory,
    QuickBooksVendorFactory,
)
from src.benchmarks.fixtures.factories.salesforce import (
    SalesforceAccountFactory,
    SalesforceCampaignFactory,
    SalesforceCaseFactory,
    SalesforceContactFactory,
    SalesforceEventFactory,
    SalesforceLeadFactory,
    SalesforceOpportunityFactory,
    SalesforceOpportunityHistoryFactory,
    SalesforceTaskFactory,
    SalesforceUserFactory,
)
from src.benchmarks.fixtures.factories.shopify import (
    ShopifyCustomerFactory,
    ShopifyDiscountCodeFactory,
    ShopifyFulfillmentFactory,
    ShopifyInventoryItemFactory,
    ShopifyOrderFactory,
    ShopifyOrderLineFactory,
    ShopifyProductFactory,
    ShopifyProductVariantFactory,
    ShopifyRefundFactory,
    ShopifyTransactionFactory,
)
from src.benchmarks.fixtures.factories.stripe import (
    StripeChargeFactory,
    StripeCustomerFactory,
    StripeInvoiceFactory,
    StripePaymentIntentFactory,
    StripePaymentMethodFactory,
    StripePlanFactory,
    StripeProductFactory,
    StripeRefundFactory,
    StripeSubscriptionFactory,
    StripeSubscriptionItemFactory,
)


def generate_salesforce_data(num_accounts=100):
    """Generate Salesforce CRM data."""
    print("\n🔷 Generating Salesforce data...")

    # Users
    print("  Creating users...")
    users = SalesforceUserFactory.create_batch(15)

    # Accounts
    print(f"  Creating {num_accounts} accounts...")
    accounts = SalesforceAccountFactory.create_batch(num_accounts)

    # Contacts (1-4 per account)
    print("  Creating contacts...")
    contacts = []
    for account in accounts:
        account_contacts = SalesforceContactFactory.create_batch(random.randint(1, 4), account_id=account.id)
        contacts.extend(account_contacts)

    # Opportunities (0-3 per account)
    print("  Creating opportunities...")
    opportunities = []
    for account in accounts:
        num_opps = random.randint(0, 3)
        if num_opps > 0:
            account_opps = SalesforceOpportunityFactory.create_batch(num_opps, account_id=account.id)
            opportunities.extend(account_opps)
            # Create opportunity history for each
            for opp in account_opps:
                SalesforceOpportunityHistoryFactory.create_batch(random.randint(1, 5), opportunity_id=opp.id)

    # Leads (with owner references)
    print("  Creating leads...")
    for _ in range(200):
        SalesforceLeadFactory.create(owner_id=random.choice(users).id)

    # Cases (linked to accounts/contacts)
    print("  Creating cases...")
    for _ in range(50):
        # Randomly assign to account or contact
        if random.random() > 0.5 and contacts:
            SalesforceCaseFactory.create(contact_id=random.choice(contacts).id)
        elif accounts:
            SalesforceCaseFactory.create(account_id=random.choice(accounts).id)
        else:
            SalesforceCaseFactory.create()

    # Campaigns
    print("  Creating campaigns...")
    SalesforceCampaignFactory.create_batch(20)

    # Tasks and Events (explicit, type-safe creation)
    print("  Creating tasks and events...")

    # Create tasks: some for contacts (who_id), some for accounts (what_id), some owned by users
    for _ in range(150):
        choice = random.random()
        if choice < 0.45 and contacts:  # contact-related task
            SalesforceTaskFactory.create(who_id=random.choice(contacts).id, owner_id=random.choice(users).id)
        elif choice < 0.9 and accounts:  # account-related task
            SalesforceTaskFactory.create(what_id=random.choice(accounts).id, owner_id=random.choice(users).id)
        else:  # user-specific task
            SalesforceTaskFactory.create(owner_id=random.choice(users).id)

    # Create events similarly, with sensible owners and linked entities
    for _ in range(100):
        choice = random.random()
        if choice < 0.45 and contacts:
            SalesforceEventFactory.create(who_id=random.choice(contacts).id, owner_id=random.choice(users).id)
        elif choice < 0.9 and accounts:
            SalesforceEventFactory.create(what_id=random.choice(accounts).id, owner_id=random.choice(users).id)
        else:
            SalesforceEventFactory.create(owner_id=random.choice(users).id)

    print("  ✅ Salesforce data generated!")


def generate_stripe_data(num_customers=200):
    """Generate Stripe payment data."""
    print("\n💳 Generating Stripe data...")

    # Customers
    print(f"  Creating {num_customers} customers...")
    customers = StripeCustomerFactory.create_batch(num_customers)

    # Products and Plans
    print("  Creating products and plans...")
    products = StripeProductFactory.create_batch(10)
    plans = []
    for product in products:
        product_plans = StripePlanFactory.create_batch(random.randint(1, 3), product_id=product.id)
        plans.extend(product_plans)

    # Subscriptions (60% of customers)
    print("  Creating subscriptions...")
    num_subs = int(num_customers * 0.6)
    for customer in random.sample(customers, num_subs):
        subscription = StripeSubscriptionFactory.create(customer_id=customer.id)
        plan = random.choice(plans)
        StripeSubscriptionItemFactory.create(subscription_id=subscription.id, plan_id=plan.id)

        # Invoices for subscription (1-12 monthly)
        StripeInvoiceFactory.create_batch(
            random.randint(1, 12), customer_id=customer.id, subscription_id=subscription.id
        )

    # Payment intents and charges (75% of customers)
    print("  Creating payments and charges...")
    num_payments = int(num_customers * 0.75)
    charges = []
    for customer in random.sample(customers, num_payments):
        for _ in range(random.randint(1, 5)):
            # create a payment intent for realism (we don't store its id on Charge)
            StripePaymentIntentFactory.create(customer_id=customer.id)
            # Charge model does not include a payment_intent_id column in our schema,
            # so create the charge linked to the customer only. We keep the intent object
            # for realism but do not pass its id to the Charge factory.
            charge = StripeChargeFactory.create(customer_id=customer.id)
            charges.append(charge)

    # Payment methods
    print("  Creating payment methods...")
    for customer in random.sample(customers, num_customers):
        StripePaymentMethodFactory.create(customer_id=customer.id)

    # Refunds (5% of charges, linked to charges)
    print("  Creating refunds...")
    if charges:
        for charge in random.sample(charges, min(20, len(charges))):
            StripeRefundFactory.create(charge_id=charge.id)
    else:
        StripeRefundFactory.create_batch(20)

    print("  ✅ Stripe data generated!")


def generate_shopify_data(num_customers=150, num_products=50, num_orders=300):
    """Generate Shopify e-commerce data."""
    print("\n🛍️  Generating Shopify data...")

    # Customers
    print(f"  Creating {num_customers} customers...")
    customers = ShopifyCustomerFactory.create_batch(num_customers)

    # Products with variants and inventory
    print(f"  Creating {num_products} products...")
    products = ShopifyProductFactory.create_batch(num_products)
    variants = []
    for product in products:
        product_variants = ShopifyProductVariantFactory.create_batch(random.randint(1, 4), product_id=product.id)
        variants.extend(product_variants)

    # Create inventory items linked to variants
    for _ in variants:
        # InventoryItem model does not have a variant_id column in our schema.
        # Create inventory items independently; we could link via SKU if desired.
        ShopifyInventoryItemFactory.create()

    # Discount codes (not directly linked to products in our schema)
    print("  Creating discount codes...")
    for _ in random.sample(products, int(num_products * 0.2)):
        ShopifyDiscountCodeFactory.create()

    # Orders with line items
    print(f"  Creating {num_orders} orders...")
    for _ in range(num_orders):
        customer = random.choice(customers)
        order = ShopifyOrderFactory.create(customer_id=customer.id)

        # Line items
        ShopifyOrderLineFactory.create_batch(random.randint(1, 5), order_id=order.id)

        # Fulfillment (70% of orders)
        if random.random() > 0.3:
            ShopifyFulfillmentFactory.create(order_id=order.id)

        # Transaction/Payment (80% of orders)
        if random.random() > 0.2:
            ShopifyTransactionFactory.create(order_id=order.id)

        # Refund (5% of orders)
        if random.random() < 0.05:
            ShopifyRefundFactory.create(order_id=order.id)

    print("  ✅ Shopify data generated!")


def generate_quickbooks_data():
    """Generate QuickBooks accounting data."""
    print("\n💼 Generating QuickBooks data...")

    # Accounts
    print("  Creating accounts...")
    accounts = QuickBooksAccountFactory.create_batch(20)

    # Customers and Vendors
    print("  Creating customers and vendors...")
    customers = QuickBooksCustomerFactory.create_batch(100)
    vendors = QuickBooksVendorFactory.create_batch(50)

    # Items (products/services)
    print("  Creating items...")
    items = QuickBooksItemFactory.create_batch(75)

    # Invoices with line items
    print("  Creating invoices...")
    invoices = []
    for _ in range(200):
        # Invoice factory expects customer_ref_value
        invoice = QuickBooksInvoiceFactory.create(customer_ref_value=random.choice(customers).id)

        # Create 1-5 distinct invoice lines (each line should reference an item)
        num_lines = random.randint(1, 5)
        for _ in range(num_lines):
            QuickBooksInvoiceLineFactory.create(
                invoice_id=invoice.id, sales_item_item_ref_value=random.choice(items).id
            )

        invoices.append(invoice)

        # Payment (70% of invoices) - Payment model uses customer_ref_value, not invoice_id
        if random.random() > 0.3:
            QuickBooksPaymentFactory.create(
                customer_ref_value=invoice.customer_ref_value,
                txn_date=invoice.txn_date,
                total_amt=invoice.total_amt,
            )

    # Bills and Purchases (linked to vendors and accounts)
    print("  Creating bills and purchases...")
    for _ in range(100):
        # Bill expects vendor_ref_value
        QuickBooksBillFactory.create(vendor_ref_value=random.choice(vendors).id)
    for _ in range(50):
        # Purchase expects account_ref_value and entity_ref_value (entity could be a vendor)
        QuickBooksPurchaseFactory.create(
            account_ref_value=random.choice(accounts).id, entity_ref_value=random.choice(vendors).id
        )

    # Journal entries (linked to accounts)
    print("  Creating journal entries...")
    for _ in range(20):
        # Journal entries don't take an account_id in the model; create with defaults
        QuickBooksJournalEntryFactory.create()

    print("  ✅ QuickBooks data generated!")


def generate_lever_data():
    """Generate Lever recruiting/ATS data."""
    print("\n👔 Generating Lever data...")

    # Users (recruiters)
    print("  Creating users...")
    LeverUserFactory.create_batch(20)

    # Stages
    print("  Creating interview stages...")
    LeverStageFactory.create_batch(7)

    # Job postings
    print("  Creating job postings...")
    LeverPostingFactory.create_batch(30)

    # Opportunities (candidates)
    print("  Creating candidates...")
    opportunities = LeverOpportunityFactory.create_batch(150)

    # Applications (70% of candidates)
    print("  Creating applications...")
    applications = []
    for opportunity in random.sample(opportunities, int(len(opportunities) * 0.7)):
        app = LeverApplicationFactory.create(opportunity_id=opportunity.id)
        applications.append(app)

    # Interviews, Offers, Feedback linked to opportunities/applications
    print("  Creating interviews, offers, and feedback...")
    for _ in range(50):
        if applications:
            # Interview links to an opportunity (not an application); use the application's opportunity_id
            LeverInterviewFactory.create(opportunity_id=random.choice(applications).opportunity_id)
        else:
            LeverInterviewFactory.create()
    for _ in range(15):
        if opportunities:
            LeverOfferFactory.create(opportunity_id=random.choice(opportunities).id)
        else:
            LeverOfferFactory.create()
    for _ in range(75):
        if applications:
            # Feedback expects opportunity_id (not application_id)
            LeverFeedbackFactory.create(opportunity_id=random.choice(applications).opportunity_id)
        else:
            LeverFeedbackFactory.create()
    for _ in range(30):
        if opportunities:
            LeverReferralFactory.create(opportunity_id=random.choice(opportunities).id)
        else:
            LeverReferralFactory.create()

    # Archive reasons
    print("  Creating archive reasons...")
    LeverArchiveReasonFactory.create_batch(10)

    print("  ✅ Lever data generated!")


def generate_brex_data():
    """Generate Brex corporate card and expense data."""
    print("\n💳 Generating Brex data...")

    # Accounts
    print("  Creating accounts...")
    accounts = BrexAccountFactory.create_batch(3)

    # Departments
    print("  Creating departments...")
    departments = BrexDepartmentFactory.create_batch(10)

    # Users
    print("  Creating users...")
    users = BrexUserFactory.create_batch(50)

    # Cards linked to existing users
    print("  Creating cards...")
    cards = []
    for _ in range(60):
        # Brex.Card model expects owner_user_id (not user_id) and doesn't have account_id
        card = BrexCardFactory.create(owner_user_id=random.choice(users).id)
        cards.append(card)

    # Transactions linked to cards
    print("  Creating transactions...")
    transactions = []
    for _ in range(500):
        # pick a real card object so Transaction.card_id references a valid Card.id
        card = random.choice(cards)
        txn = BrexTransactionFactory.create(card_id=card.id)
        transactions.append(txn)

    # Expenses with receipts (70% of transactions)
    print("  Creating expenses...")
    expenses = []
    for transaction in random.sample(transactions, int(len(transactions) * 0.7)):
        # assign expense to an existing user and department for realism
        expense = BrexExpenseFactory.create(
            transaction_id=transaction.id,
            user_id=random.choice(users).id,
            department_id=random.choice(departments).id,
        )
        expenses.append(expense)
        # Receipts are linked to transactions (receipt.transaction_id), not expense_id
        if random.random() > 0.3:
            BrexReceiptFactory.create(transaction_id=transaction.id)

    # Statements and Transfers linked to accounts
    print("  Creating statements and transfers...")
    for _ in range(12):
        BrexStatementFactory.create(account_id=random.choice(accounts).id)
    for _ in range(20):
        # Transfers require explicit from_account_id and to_account_id
        from_acc = random.choice(accounts)
        to_acc = random.choice(accounts)
        # avoid no-op transfers where from == to
        if from_acc.id == to_acc.id:
            # pick a different account if possible
            candidates = [a for a in accounts if a.id != from_acc.id]
            if candidates:
                to_acc = random.choice(candidates)
        BrexTransferFactory.create(from_account_id=from_acc.id, to_account_id=to_acc.id)

    print("  ✅ Brex data generated!")


def generate_calendly_data():
    """Generate Calendly scheduling data."""
    print("\n📅 Generating Calendly data...")

    # Organizations
    print("  Creating organizations...")
    # we don't directly reference organizations in events; create them for completeness
    CalendlyOrganizationFactory.create_batch(2)

    # Users
    print("  Creating users...")
    users = CalendlyUserFactory.create_batch(25)

    # Event types
    print("  Creating event types...")
    event_types = CalendlyEventTypeFactory.create_batch(15)

    # Events linked to users and organizations
    print("  Creating events...")
    events = []
    for _ in range(200):
        # Events are primarily linked to an event_type (URI). Memberships link users to events.
        event_type = random.choice(event_types)
        event = CalendlyEventFactory.create(event_type_uri=event_type.uri)
        events.append(event)

    # Invitees with details
    print("  Creating invitees...")
    for event in events:
        for _ in range(random.randint(1, 3)):
            invitee = CalendlyEventInviteeFactory.create(event_uri=event.uri)
            # Add tracking and Q&A
            if random.random() > 0.5:
                CalendlyInviteeQuestionAnswerFactory.create(invitee_uri=invitee.uri)
            # (Memberships created per-event below to avoid duplicate primary-key inserts)

        # Event membership - attach a small set of distinct users to the event
        if users and random.random() > 0.3:
            num_members = random.randint(1, min(3, len(users)))
            for member in random.sample(users, num_members):
                CalendlyEventMembershipFactory.create(event_uri=event.uri, user_uri=member.uri)

    # Routing forms and submissions linked to forms
    print("  Creating routing forms...")
    routing_forms = []
    for _ in range(5):
        form = CalendlyRoutingFormFactory.create()
        routing_forms.append(form)
        for _ in range(random.randint(5, 15)):
            # RoutingFormSubmission uses routing_form_uri and result_event_type_uri
            et = random.choice(event_types)
            CalendlyRoutingFormSubmissionFactory.create(routing_form_uri=form.uri, result_event_type_uri=et.uri)

    # Webhooks
    print("  Creating webhooks...")
    CalendlyWebhookSubscriptionFactory.create_batch(5)

    print("  ✅ Calendly data generated!")


def generate_customerio_data():
    """Generate Customer.io marketing automation data."""
    print("\n📧 Generating Customer.io data...")

    # Customers
    print("  Creating customers...")
    customers = CustomerioCustomerFactory.create_batch(300)

    # Campaigns
    print("  Creating campaigns...")
    campaigns = CustomerioCampaignFactory.create_batch(20)

    # Campaign actions (interactions) linked to campaigns
    # Note: CampaignAction model does not have a customer_id; deliveries link actions to customers.
    print("  Creating campaign actions...")
    for campaign in campaigns:
        # create a few actions per campaign
        for _ in range(random.randint(1, 6)):
            CustomerioCampaignActionFactory.create(campaign_id=campaign.id)

    # Email activity linked to customers and campaigns
    print("  Creating email activity...")
    # Create deliveries first and reuse them for opens/clicks/bounces to keep relationships consistent
    deliveries = []
    for _ in range(1000):
        delivery = CustomerioDeliveriesFactory.create(
            customer_id=random.choice(customers).id, campaign_id=random.choice(campaigns).id
        )
        deliveries.append(delivery)

    # Opens, clicks, bounces, spam complaints reference an existing delivery (by delivery_id)
    for _ in range(600):
        if deliveries:
            d = random.choice(deliveries)
            CustomerioOpensFactory.create(delivery_id=d.delivery_id)
    for _ in range(300):
        if deliveries:
            d = random.choice(deliveries)
            CustomerioClicksFactory.create(delivery_id=d.delivery_id)
    for _ in range(50):
        if deliveries:
            d = random.choice(deliveries)
            CustomerioBouncesFactory.create(delivery_id=d.delivery_id)
    for _ in range(10):
        if deliveries:
            d = random.choice(deliveries)
            CustomerioSpamComplaintsFactory.create(delivery_id=d.delivery_id)

    # Unsubscribes link to a delivery and the customer who received it
    for _ in range(30):
        if deliveries:
            d = random.choice(deliveries)
            CustomerioUnsubscribesFactory.create(delivery_id=d.delivery_id, customer_id=d.customer_id)

    # Newsletters
    print("  Creating newsletters...")
    CustomerioNewsletterFactory.create_batch(15)

    print("  ✅ Customer.io data generated!")


def generate_google_ads_data():
    """Generate Google Ads advertising data."""
    print("\n🔍 Generating Google Ads data...")

    # Account
    print("  Creating account...")
    account = GoogleAdsAccountFactory.create()

    # Budget linked to account
    print("  Creating budgets...")
    for _ in range(5):
        # Budget model does not have an account_id column in our schema; create budgets independently
        GoogleAdsBudgetFactory.create()

    # Campaigns linked to account
    print("  Creating campaigns...")
    campaigns = GoogleAdsCampaignFactory.create_batch(15, account_id=account.id)

    # Ad groups
    print("  Creating ad groups...")
    ad_groups = []
    for campaign in campaigns:
        groups = GoogleAdsAdGroupFactory.create_batch(random.randint(2, 5), campaign_id=campaign.id)
        ad_groups.extend(groups)

    # Ads
    print("  Creating ads...")
    for ad_group in ad_groups:
        GoogleAdsAdFactory.create_batch(random.randint(2, 4), ad_group_id=ad_group.id)

    # Keywords
    print("  Creating keywords...")
    keywords = []
    for ad_group in ad_groups:
        kws = GoogleAdsKeywordFactory.create_batch(random.randint(3, 10), ad_group_id=ad_group.id)
        keywords.extend(kws)

    # Stats (30 days) - create with sequential dates to avoid duplicate key violations
    print("  Creating performance stats...")
    base_date = date.today() - timedelta(days=30)
    for keyword in keywords:
        for i in range(30):
            GoogleAdsKeywordStatsFactory.create(keyword_id=keyword.id, date=base_date + timedelta(days=i))
    for campaign in campaigns:
        for i in range(30):
            GoogleAdsCampaignStatsFactory.create(campaign_id=campaign.id, date=base_date + timedelta(days=i))
    for ad_group in ad_groups:
        for i in range(30):
            GoogleAdsAdGroupStatsFactory.create(ad_group_id=ad_group.id, date=base_date + timedelta(days=i))

    # Geographic stats linked to account
    print("  Creating geographic stats...")
    for _ in range(50):
        # GeographicStats is per-campaign in this schema; pick a campaign to attach stats to
        if campaigns:
            GoogleAdsGeographicStatsFactory.create(campaign_id=random.choice(campaigns).id)

    print("  ✅ Google Ads data generated!")


def generate_linkedin_ads_data():
    """Generate LinkedIn Ads B2B advertising data."""
    print("\n💼 Generating LinkedIn Ads data...")

    # Account
    print("  Creating account...")
    account = LinkedInAdsAccountFactory.create()

    # Account users linked to account
    print("  Creating account users...")
    for _ in range(5):
        LinkedInAdsAccountUserFactory.create(account_id=account.id)

    # Campaign groups linked to account
    print("  Creating campaign groups...")
    campaign_groups = LinkedInAdsCampaignGroupFactory.create_batch(10, account_id=account.id)

    # Campaigns linked to campaign groups
    print("  Creating campaigns...")
    campaigns = []
    for group in campaign_groups:
        camps = LinkedInAdsCampaignFactory.create_batch(random.randint(2, 4), campaign_group_id=group.id)
        campaigns.extend(camps)

    # Creatives
    print("  Creating creatives...")
    creatives = []
    for campaign in campaigns:
        crs = LinkedInAdsCreativeFactory.create_batch(random.randint(2, 5), campaign_id=campaign.id)
        creatives.extend(crs)

    # Analytics (30 days) - create with sequential dates to avoid duplicate key violations
    print("  Creating analytics...")
    base_date = date.today() - timedelta(days=30)
    for campaign in campaigns:
        for i in range(30):
            LinkedInAdsAdAnalyticsByCampaignFactory.create(campaign_id=campaign.id, day=base_date + timedelta(days=i))
    for creative in creatives:
        for i in range(30):
            LinkedInAdsAdAnalyticsByCreativeFactory.create(creative_id=creative.id, day=base_date + timedelta(days=i))

    # Demographics linked to campaigns
    print("  Creating demographics...")
    for campaign in random.sample(campaigns, int(len(campaigns) * 0.5)):
        LinkedInAdsCampaignDemographicsFactory.create_batch(10, campaign_id=campaign.id)

    # Conversions linked to campaigns
    print("  Creating conversions...")
    for _ in range(100):
        # Conversion model is per-account in this schema; link to the account rather than a campaign
        LinkedInAdsConversionFactory.create(account_id=account.id)

    print("  ✅ LinkedIn Ads data generated!")


def clear_all_data():
    """Clear all existing data from the database."""
    from sqlalchemy import text

    from src.benchmarks.fixtures.db import Session as SessionMaker

    print("\n🗑️  Clearing existing data...")
    session = SessionMaker()

    try:
        # Get all tables in *_data schemas
        result = session.execute(
            text("""
                SELECT schemaname, tablename
                FROM pg_tables
                WHERE schemaname LIKE '%_data'
                ORDER BY schemaname, tablename
            """)
        )
        tables = result.fetchall()

        # Truncate all tables
        for schema, table in tables:
            try:
                session.execute(text(f'TRUNCATE TABLE "{schema}"."{table}" CASCADE'))
            except Exception as e:
                print(f"  ⚠️  Could not truncate {schema}.{table}: {e}")

        session.commit()
        print(f"  ✅ Cleared {len(tables)} tables")
    except Exception as e:
        print(f"  ❌ Error clearing data: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def main():
    """Main entry point."""
    print("=" * 60)
    print("🚀 Generating Fake Data for Analytics Database")
    print("=" * 60)

    # Clear existing data first
    clear_all_data()

    # Import Session from db and create an instance
    from src.benchmarks.fixtures.db import Session as SessionMaker

    # Create a session instance
    session = SessionMaker()

    # Configure all factories to use this session instance
    import src.benchmarks.fixtures.factories.brex as brex_factories
    import src.benchmarks.fixtures.factories.calendly as calendly_factories
    import src.benchmarks.fixtures.factories.customerio as customerio_factories
    import src.benchmarks.fixtures.factories.google_adwords as google_factories
    import src.benchmarks.fixtures.factories.lever as lever_factories
    import src.benchmarks.fixtures.factories.linkedin_ads as linkedin_factories
    import src.benchmarks.fixtures.factories.quickbooks as qb_factories
    import src.benchmarks.fixtures.factories.salesforce as sf_factories
    import src.benchmarks.fixtures.factories.shopify as shopify_factories
    import src.benchmarks.fixtures.factories.stripe as stripe_factories

    # Set session on all factory modules
    for module in [
        sf_factories,
        stripe_factories,
        shopify_factories,
        qb_factories,
        lever_factories,
        brex_factories,
        calendly_factories,
        customerio_factories,
        google_factories,
        linkedin_factories,
    ]:
        for name in dir(module):
            obj = getattr(module, name)
            if hasattr(obj, "_meta") and hasattr(obj._meta, "sqlalchemy_session"):
                obj._meta.sqlalchemy_session = session

    try:
        generate_salesforce_data()
        generate_stripe_data()
        generate_shopify_data()
        generate_quickbooks_data()
        generate_lever_data()
        generate_brex_data()
        generate_calendly_data()
        generate_customerio_data()
        generate_google_ads_data()
        generate_linkedin_ads_data()

        session.commit()
        session.close()

        print("\n" + "=" * 60)
        print("✅ All data generated successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error generating data: {e}")
        import traceback

        traceback.print_exc()
        session.rollback()
        session.close()
        raise


if __name__ == "__main__":
    main()
