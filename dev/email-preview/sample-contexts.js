/*
 * Default sample data for the email template preview tool (index.html).
 *
 * COMMON_CONTEXT mirrors `common-context` in metabase.channel.email.messages —
 * values every template receives. SAMPLE_CONTEXTS holds per-template extras,
 * shaped to match what each template's real render call site passes (see the
 * render calls in messages.clj, impl/email.clj, and the notification handlers
 * seeded in notification/seed.clj).
 *
 * These are demo values only — the preview never sends email. Tweak freely;
 * per-browser edits live in localStorage, this file is just the defaults.
 */

const BUTTON_STYLE =
  "display: inline-block; box-sizing: border-box; padding: 0.5rem 1.375rem; " +
  "font-size: 1.063rem; font-weight: bold; text-decoration: none; cursor: pointer; " +
  "color: #fff; border: 1px solid #509EE3; background-color: #509EE3; border-radius: 4px;";

// Templates rendered through the notification pipeline get a snake_case
// `context` map instead of the camelCase top-level keys.
const NOTIFICATION_CONTEXT = {
  application_name: "Metabase",
  application_color: "#509EE3",
  application_logo_url: "http://static.metabase.com/email_logo.png",
  site_url: "http://localhost:3000",
};

const NOTIFICATION_STYLE = {
  color_text_dark: "#4C5773",
  color_text_medium: "#696E7B",
  color_text_light: "#949AAB",
};

const CARD_PLACEHOLDER = (name) =>
  `<div style="padding:2em;background:#f9fbfc;border:1px dashed #ccc;text-align:center;color:#949AAB;margin-bottom:1em;">[rendered card: ${name}]</div>`;

window.COMMON_CONTEXT = {
  applicationName: "Metabase",
  applicationColor: "#509EE3",
  applicationLogoUrl: "http://static.metabase.com/email_logo.png",
  buttonStyle: BUTTON_STYLE,
  colorTextLight: "#B8BBC3",
  colorTextMedium: "#949AAB",
  colorTextDark: "#4C5773",
  siteUrl: "http://localhost:3000",
};

window.SAMPLE_CONTEXTS = {
  // ---- Account & auth ----

  mfa_enabled: {},
  mfa_disabled: {},
  mfa_removed_by_admin: {},
  mfa_login_code: { code: "836114" },

  password_reset: {
    emailType: "password_reset",
    logoHeader: true,
    google: false,
    nonGoogleSSO: false,
    isActive: true,
    passwordResetUrl: "http://localhost:3000/auth/reset_password/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    adminEmail: "admin@example.com",
    adminEmailSet: true,
  },

  login_from_new_device: {
    context: NOTIFICATION_CONTEXT,
    payload: { style: { color_text_dark: "#4C5773" } },
    "first-name": "Meredith",
    device: "Chrome (Mac OS X 10.15)",
    location: "Oakland, California",
    timestamp: "Friday, July 10, 2026 at 9:14 AM (PDT)",
  },

  new_user_invite: {
    context: NOTIFICATION_CONTEXT,
    payload: {
      event_info: {
        details: { invitor: { first_name: "Meredith", email: "meredith@example.com" } },
        object: { is_from_setup: false },
      },
      custom: {
        user_invited_join_url: "http://localhost:3000/auth/join/a1b2c3d4-e5f6-7890",
        // Set a name here (and optionally invite_target_is_dashboard) to
        // preview the "wants to share a question/dashboard" variant.
        invite_target_name: "",
        invite_target_is_dashboard: false,
      },
    },
  },

  user_joined_notification: {
    context: NOTIFICATION_CONTEXT,
    payload: { style: { color_text_dark: "#4C5773" } },
    joinedUserName: "Oscar",
    joinedViaSSO: false,
    joinedUserEmail: "oscar@example.com",
    joinedDate: "Friday, July 10",
    adminEmail: "admin@example.com",
    joinedUserEditUrl: "http://localhost:3000/admin/people",
  },

  // ---- Surveys & follow-ups ----

  follow_up_email: {
    emailType: "notification",
    logoHeader: true,
    heading: "We hope you've been enjoying Metabase.",
    callToAction: "Would you mind taking a quick 5 minute survey to tell us how it's going?",
    link: "https://metabase.com/feedback/active",
  },

  creator_sentiment_email: {
    emailType: "notification",
    logoHeader: true,
    "first-name": "Meredith",
    link: "https://metabase.com/feedback/creator",
    "self-hosted": "http://localhost:3000",
  },

  // ---- Subscriptions & alerts ----

  dashboard_subscription: {
    context: { ...NOTIFICATION_CONTEXT, include_branding: true },
    creator: { common_name: "Meredith Palmer" },
    payload: {
      dashboard: {
        id: 12,
        name: "Quarterly Revenue Overview",
        description: "<p>Key revenue metrics, refreshed daily for the leadership team.</p>",
      },
      parameters: [
        { id: "a1b2c3d4", name: "Date Range", value: "past30days" },
        { id: "e5f6a7b8", name: "Category", value: "Gadget" },
      ],
      dashboard_subscription: { id: 301, disable_links: false },
      style: NOTIFICATION_STYLE,
    },
    computed: {
      icon_cid: "dashboard-icon@metabase", // cid: inline attachment; shows broken in browser
      dashboard_has_tabs: false,
      dashboard_content: CARD_PLACEHOLDER("Monthly Orders") + CARD_PLACEHOLDER("Revenue by Region"),
      filters:
        "<table cellpadding='0' cellspacing='0'><tr>" +
        "<td style='font-size:12px;color:#949AAB;padding-right:12px;'><strong style='color:#696E7B;'>Date Range:</strong> Past 30 days</td>" +
        "<td style='font-size:12px;color:#949AAB;'><strong style='color:#696E7B;'>Category:</strong> Gadget</td>" +
        "</tr></table>",
      management_text: "Manage your subscriptions",
      management_url: "http://localhost:3000/account/notifications",
    },
  },

  notification_card: {
    context: { ...NOTIFICATION_CONTEXT, include_branding: true },
    creator: { common_name: "Meredith Palmer" },
    payload: {
      card: { id: 42, name: "Monthly Orders" },
      notification_card: { send_condition: "goal_above", send_once: true, disable_links: false },
      style: NOTIFICATION_STYLE,
    },
    computed: {
      icon_cid: "bell-icon@metabase", // cid: inline attachment; shows broken in browser
      content: CARD_PLACEHOLDER("Monthly Orders"),
      alert_schedule: "Run daily at 9:00 AM",
      goal_value: 5000,
      management_text: "Manage your subscriptions",
      management_url: "http://localhost:3000/account/notifications",
    },
  },

  notification_card_new_confirmation: {
    emailType: "notification",
    logoHeader: true,
    payload: {
      event_info: {
        object: {
          payload: {
            card_id: 42,
            card: { name: "Monthly Orders" },
            send_condition: "has_result",
            disable_links: false,
          },
        },
      },
    },
  },

  notification_card_unsubscribed: {
    emailType: "notification",
    logoHeader: true,
    payload: { card_id: 42, card: { name: "Monthly Orders" } },
  },

  notification_card_you_were_added: {
    emailType: "notification",
    logoHeader: true,
    payload: { card_id: 42, card: { name: "Monthly Orders" }, send_condition: "has_result" },
  },

  notification_card_you_were_removed: {
    emailType: "notification",
    logoHeader: true,
    actor_name: "Meredith Palmer",
    payload: { card_id: 42, card: { name: "Monthly Orders" }, disable_links: false },
  },

  card_notification_archived: {
    emailType: "notification",
    logoHeader: true,
    card: { id: 42, name: "Monthly Orders" },
    actor: { first_name: "Meredith", last_name: "Palmer" },
    disable_links: false,
  },

  card_notification_changed_stopped: {
    emailType: "notification",
    logoHeader: true,
    card: { id: 42, name: "Monthly Orders" },
    actor: { first_name: "Meredith", last_name: "Palmer" },
    disable_links: false,
  },

  broken_subscription_notification: {
    emailType: "notification",
    logoHeader: true,
    dashboardName: "Quarterly Revenue Overview",
    dashboardUrl: "http://localhost:3000/dashboard/12",
    disable_links: false,
    badParameters: [
      { name: "Region", value: "West or Midwest" },
      { name: "Product Category", value: "Gadget" },
    ],
    affectedUsers: [
      { "notification-type": "email", recipient: "Meredith Palmer", role: "Dashboard Creator" },
      { "notification-type": "email", recipient: "Oscar Nunez", role: "Subscription Creator" },
    ],
  },

  warn_deprecate_pulse: {
    emailType: "notification",
    logoHeader: true,
    userName: "Meredith Palmer",
    instanceURL: "http://localhost:3000",
    pulses: [
      { name: "Weekly Sales Pulse", url: "http://localhost:3000/pulse/23" },
      { name: "Support Ticket Volume", url: "http://localhost:3000/pulse/31" },
    ],
  },

  // ---- Comments & collaboration ----

  comment_created: {
    context: NOTIFICATION_CONTEXT,
    payload: {
      style: { color_text_dark: "#4C5773" },
      event_info: {
        author: "Oscar Nunez",
        parent_author: "Meredith Palmer",
        entity_type: "document",
        entity_title: "Q3 Planning Notes",
        document_href: "/document/87",
        comment_href: "/document/87?comment=214",
        parent_comment: "<p>Should we fold the churn analysis into this doc, or keep it separate?</p>",
        comment: "<p>Let's fold it in — I'll add a section under <strong>Retention</strong> this afternoon.</p>",
      },
    },
  },

  // ---- Admin & ops ----

  security_advisory: {
    emailType: "notification",
    logoHeader: false,
    context: {
      ...NOTIFICATION_CONTEXT,
      style: { button: BUTTON_STYLE },
    },
    payload: {
      custom: {
        severity_label: "Critical",
        severity_color: "#E65050",
        status_label: "Active",
        security_center_url: "http://localhost:3000/admin/tools/security-center",
      },
      event_info: {
        object: {
          title: "SQL injection in embedded question parameters",
          description:
            "A vulnerability was identified that could allow specially crafted embedded question parameters " +
            "to execute arbitrary SQL against connected databases. Your instance version matches the affected range.",
          remediation: "Upgrade to Metabase 55.8.2 or later, or disable static embedding until you can upgrade.",
          advisory_url: "https://www.metabase.com/security/advisories/MB-2026-0042",
        },
      },
    },
  },

  slack_token_error: {
    emailType: "notification",
    logoHeader: false,
    context: {
      ...NOTIFICATION_CONTEXT,
      style: { button: BUTTON_STYLE },
    },
  },

  support_access_grant: {
    context: NOTIFICATION_CONTEXT,
    payload: {
      style: { color_text_dark: "#4C5773" },
      event_info: {
        duration_minutes: 120,
        grant_end_time: "2026-07-10T21:14:00Z",
        notes:
          "Investigating slow dashboard loads reported by the customer.\n" +
          "Access limited to admin settings and query diagnostics.",
        ticket_number: "SUP-18342",
        password_reset_url: "http://localhost:3000/auth/reset_password/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      },
    },
  },

  "persisted-model-error": {
    "database-name": "Sample Database",
    errors: [
      {
        "is-not-first": false,
        error: "Table 'orders_source' not found; it may have been renamed or dropped.",
        "card-id": 42,
        "card-name": "Monthly Orders",
        "collection-name": "Finance",
        "last-run-at": "July 10, 2026, 3:10 AM PDT",
        "last-run-trigger": "Scheduled",
        "card-url": "http://localhost:3000/question/42",
        "collection-url": "http://localhost:3000/collection/7",
        "caching-log-details-url": "http://localhost:3000/admin/tools/model-caching/101",
      },
      {
        "is-not-first": true,
        error: "Query timed out after 600 seconds.",
        "card-id": 43,
        "card-name": "Customer LTV",
        "collection-name": "Finance",
        "last-run-at": "July 10, 2026, 3:12 AM PDT",
        "last-run-trigger": "Scheduled",
        "card-url": "http://localhost:3000/question/43",
        "collection-url": "http://localhost:3000/collection/7",
        "caching-log-details-url": "http://localhost:3000/admin/tools/model-caching/102",
      },
    ],
  },

  transform_failed: {
    context: NOTIFICATION_CONTEXT,
    payload: {
      style: { color_text_dark: "#4C5773" },
      event_info: {
        job_name: "Nightly Warehouse Refresh",
        job_href: "http://localhost:3000/admin/transforms/jobs/7",
        failures: [
          {
            transform_name: "Orders Enriched",
            transform_href: "http://localhost:3000/admin/transforms/15/runs",
            message: {
              first_line: 'Column "discount_pct" does not exist in source table.',
              details: [
                "at stage 2 of 3 (join with promotions)",
                "last successful run: July 9, 2026, 2:00 AM",
              ],
            },
          },
          {
            transform_name: "Customer LTV Rollup",
            transform_href: "http://localhost:3000/admin/transforms/16/runs",
            message: { first_line: "Query timed out after 600 seconds.", details: [] },
          },
        ],
      },
    },
  },

  transform_failure_digest: {
    context: NOTIFICATION_CONTEXT,
    payload: {
      style: { color_text_dark: "#4C5773" },
      event_info: {
        job_count: 2,
        failure_count: 5,
        jobs: [
          {
            job_name: "Nightly Warehouse Refresh",
            job_href: "http://localhost:3000/admin/transforms/jobs/7",
            failure_count: 3,
            latest_error: 'Column "discount_pct" does not exist in source table.',
          },
          {
            job_name: "Hourly Events Rollup",
            job_href: "http://localhost:3000/admin/transforms/jobs/9",
            failure_count: 2,
            latest_error: "Query timed out after 600 seconds.",
          },
        ],
      },
    },
  },
};
