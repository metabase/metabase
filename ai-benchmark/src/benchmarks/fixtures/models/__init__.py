"""
SQLAlchemy models auto-generated from the analytics database schemas.

This package contains 98 models across 10 different SaaS platform schemas.
Each model represents a table in the database with proper relationships,
indexes, and constraints.
"""

# Brex - Corporate cards and expense management
from .brex import (
    Account as BrexAccount,
)
from .brex import (
    Card as BrexCard,
)
from .brex import (
    Department as BrexDepartment,
)
from .brex import (
    Expense as BrexExpense,
)
from .brex import (
    Receipt as BrexReceipt,
)
from .brex import (
    Statement as BrexStatement,
)
from .brex import (
    Transaction as BrexTransaction,
)
from .brex import (
    Transfer as BrexTransfer,
)
from .brex import (
    User as BrexUser,
)

# Calendly - Scheduling and meetings
from .calendly import (
    Event as CalendlyEvent,
)
from .calendly import (
    EventMembership as CalendlyEventMembership,
)
from .calendly import (
    EventType as CalendlyEventType,
)
from .calendly import (
    Invitee as CalendlyInvitee,
)
from .calendly import (
    InviteeQuestionAnswer as CalendlyInviteeQuestionAnswer,
)
from .calendly import (
    Organization as CalendlyOrganization,
)
from .calendly import (
    RoutingForm as CalendlyRoutingForm,
)
from .calendly import (
    RoutingFormSubmission as CalendlyRoutingFormSubmission,
)
from .calendly import (
    User as CalendlyUser,
)
from .calendly import (
    WebhookSubscription as CalendlyWebhookSubscription,
)

# Customer.io - Marketing automation
from .customerio import (
    Bounces as CustomerIOBounces,
)
from .customerio import (
    Campaign as CustomerIOCampaign,
)
from .customerio import (
    CampaignAction as CustomerIOCampaignAction,
)
from .customerio import (
    Clicks as CustomerIOClicks,
)
from .customerio import (
    Customer as CustomerIOCustomer,
)
from .customerio import (
    Deliveries as CustomerIODeliveries,
)
from .customerio import (
    Newsletter as CustomerIONewsletter,
)
from .customerio import (
    Opens as CustomerIOOpens,
)
from .customerio import (
    SpamComplaints as CustomerIOSpamComplaints,
)
from .customerio import (
    Unsubscribes as CustomerIOUnsubscribes,
)

# Google Ads - Advertising platform
from .google_adwords import (
    Account as GoogleAdsAccount,
)
from .google_adwords import (
    Ad as GoogleAd,
)
from .google_adwords import (
    AdGroup as GoogleAdGroup,
)
from .google_adwords import (
    AdGroupStats as GoogleAdGroupStats,
)
from .google_adwords import (
    Budget as GoogleBudget,
)
from .google_adwords import (
    Campaign as GoogleCampaign,
)
from .google_adwords import (
    CampaignStats as GoogleCampaignStats,
)
from .google_adwords import (
    GeographicStats as GoogleGeographicStats,
)
from .google_adwords import (
    Keyword as GoogleKeyword,
)
from .google_adwords import (
    KeywordStats as GoogleKeywordStats,
)

# Lever - Recruiting and ATS
from .lever import (
    Application as LeverApplication,
)
from .lever import (
    ArchiveReason as LeverArchiveReason,
)
from .lever import (
    Feedback as LeverFeedback,
)
from .lever import (
    Interview as LeverInterview,
)
from .lever import (
    Offer as LeverOffer,
)
from .lever import (
    Opportunity as LeverOpportunity,
)
from .lever import (
    Posting as LeverPosting,
)
from .lever import (
    Referral as LeverReferral,
)
from .lever import (
    Stage as LeverStage,
)
from .lever import (
    User as LeverUser,
)

# LinkedIn Ads - B2B advertising
from .linkedin_ads import (
    Account as LinkedInAccount,
)
from .linkedin_ads import (
    AccountUser as LinkedInAccountUser,
)
from .linkedin_ads import (
    AdAnalyticsByCampaign as LinkedInAdAnalyticsByCampaign,
)
from .linkedin_ads import (
    AdAnalyticsByCreative as LinkedInAdAnalyticsByCreative,
)
from .linkedin_ads import (
    Campaign as LinkedInCampaign,
)
from .linkedin_ads import (
    CampaignDemographics as LinkedInCampaignDemographics,
)
from .linkedin_ads import (
    CampaignGroup as LinkedInCampaignGroup,
)
from .linkedin_ads import (
    Conversion as LinkedInConversion,
)
from .linkedin_ads import (
    Creative as LinkedInCreative,
)

# QuickBooks - Accounting software
from .quickbooks import (
    Account as QuickBooksAccount,
)
from .quickbooks import (
    Bill as QuickBooksBill,
)
from .quickbooks import (
    Customer as QuickBooksCustomer,
)
from .quickbooks import (
    Invoice as QuickBooksInvoice,
)
from .quickbooks import (
    InvoiceLine as QuickBooksInvoiceLine,
)
from .quickbooks import (
    Item as QuickBooksItem,
)
from .quickbooks import (
    JournalEntry as QuickBooksJournalEntry,
)
from .quickbooks import (
    Payment as QuickBooksPayment,
)
from .quickbooks import (
    Purchase as QuickBooksPurchase,
)
from .quickbooks import (
    Vendor as QuickBooksVendor,
)

# Salesforce - CRM platform
from .salesforce import (
    Account as SalesforceAccount,
)
from .salesforce import (
    Campaign as SalesforceCampaign,
)
from .salesforce import (
    Case as SalesforceCase,
)
from .salesforce import (
    Contact as SalesforceContact,
)
from .salesforce import (
    Event as SalesforceEvent,
)
from .salesforce import (
    Lead as SalesforceLead,
)
from .salesforce import (
    Opportunity as SalesforceOpportunity,
)
from .salesforce import (
    OpportunityHistory as SalesforceOpportunityHistory,
)
from .salesforce import (
    Task as SalesforceTask,
)
from .salesforce import (
    User as SalesforceUser,
)

# Shopify - E-commerce platform
from .shopify import (
    Customer as ShopifyCustomer,
)
from .shopify import (
    DiscountCode as ShopifyDiscountCode,
)
from .shopify import (
    Fulfillment as ShopifyFulfillment,
)
from .shopify import (
    InventoryItem as ShopifyInventoryItem,
)
from .shopify import (
    Order as ShopifyOrder,
)
from .shopify import (
    OrderLine as ShopifyOrderLine,
)
from .shopify import (
    Product as ShopifyProduct,
)
from .shopify import (
    ProductVariant as ShopifyProductVariant,
)
from .shopify import (
    Refund as ShopifyRefund,
)
from .shopify import (
    Transaction as ShopifyTransaction,
)

# Stripe - Payment processing
from .stripe import (
    Charge as StripeCharge,
)
from .stripe import (
    Customer as StripeCustomer,
)
from .stripe import (
    Invoice as StripeInvoice,
)
from .stripe import (
    PaymentIntent as StripePaymentIntent,
)
from .stripe import (
    PaymentMethod as StripePaymentMethod,
)
from .stripe import (
    Plan as StripePlan,
)
from .stripe import (
    Product as StripeProduct,
)
from .stripe import (
    Refund as StripeRefund,
)
from .stripe import (
    Subscription as StripeSubscription,
)
from .stripe import (
    SubscriptionItem as StripeSubscriptionItem,
)

__all__ = [
    # Brex
    "BrexAccount",
    "BrexCard",
    "BrexDepartment",
    "BrexExpense",
    "BrexReceipt",
    "BrexStatement",
    "BrexTransaction",
    "BrexTransfer",
    "BrexUser",
    # Calendly
    "CalendlyEvent",
    "CalendlyEventMembership",
    "CalendlyEventType",
    "CalendlyInvitee",
    "CalendlyInviteeQuestionAnswer",
    "CalendlyOrganization",
    "CalendlyRoutingForm",
    "CalendlyRoutingFormSubmission",
    "CalendlyUser",
    "CalendlyWebhookSubscription",
    # Customer.io
    "CustomerIOBounces",
    "CustomerIOCampaign",
    "CustomerIOCampaignAction",
    "CustomerIOClicks",
    "CustomerIOCustomer",
    "CustomerIODeliveries",
    "CustomerIONewsletter",
    "CustomerIOOpens",
    "CustomerIOSpamComplaints",
    "CustomerIOUnsubscribes",
    # Google Ads
    "GoogleAd",
    "GoogleAdGroup",
    "GoogleAdGroupStats",
    "GoogleAdsAccount",
    "GoogleBudget",
    "GoogleCampaign",
    "GoogleCampaignStats",
    "GoogleGeographicStats",
    "GoogleKeyword",
    "GoogleKeywordStats",
    # Lever
    "LeverApplication",
    "LeverArchiveReason",
    "LeverFeedback",
    "LeverInterview",
    "LeverOffer",
    "LeverOpportunity",
    "LeverPosting",
    "LeverReferral",
    "LeverStage",
    "LeverUser",
    # LinkedIn Ads
    "LinkedInAccount",
    "LinkedInAccountUser",
    "LinkedInAdAnalyticsByCampaign",
    "LinkedInAdAnalyticsByCreative",
    "LinkedInCampaign",
    "LinkedInCampaignDemographics",
    "LinkedInCampaignGroup",
    "LinkedInConversion",
    "LinkedInCreative",
    # QuickBooks
    "QuickBooksAccount",
    "QuickBooksBill",
    "QuickBooksCustomer",
    "QuickBooksInvoice",
    "QuickBooksInvoiceLine",
    "QuickBooksItem",
    "QuickBooksJournalEntry",
    "QuickBooksPayment",
    "QuickBooksPurchase",
    "QuickBooksVendor",
    # Salesforce
    "SalesforceAccount",
    "SalesforceCampaign",
    "SalesforceCase",
    "SalesforceContact",
    "SalesforceEvent",
    "SalesforceLead",
    "SalesforceOpportunity",
    "SalesforceOpportunityHistory",
    "SalesforceTask",
    "SalesforceUser",
    # Shopify
    "ShopifyCustomer",
    "ShopifyDiscountCode",
    "ShopifyFulfillment",
    "ShopifyInventoryItem",
    "ShopifyOrder",
    "ShopifyOrderLine",
    "ShopifyProduct",
    "ShopifyProductVariant",
    "ShopifyRefund",
    "ShopifyTransaction",
    # Stripe
    "StripeCharge",
    "StripeCustomer",
    "StripeInvoice",
    "StripePaymentIntent",
    "StripePaymentMethod",
    "StripePlan",
    "StripeProduct",
    "StripeRefund",
    "StripeSubscription",
    "StripeSubscriptionItem",
]
