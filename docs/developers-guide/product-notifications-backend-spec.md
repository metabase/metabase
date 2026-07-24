# Build product notifications as a persisted backend domain

**Status:** Ready for implementation

**Related work:** [PR #78404](https://github.com/metabase/metabase/pull/78404)

## Keep the product scope narrow

Product notifications are remotely authored, dismissible messages displayed in
the navbar promo slot. Metabase fetches the messages from its static
infrastructure, selects the messages that apply to the current instance and
person, and returns them to the frontend in display order.

This feature is not part of Metabase's notification-delivery domain. It doesn't
create subscriptions, resolve recipients, send messages through email or Slack,
or provide an inbox. The backend should still use the `product-notifications`
name to match the existing `ProductNotifications` frontend feature.

Security Center is the closest existing architectural precedent. Product
notifications should reuse its production patterns where they fit: validate
remote data before persisting it, keep remote and local state separate, use
typed models and APIs, synchronize transactionally, and preserve the last known
good state. Product notifications should not depend on Security Center models or
its Enterprise-only notification-delivery behavior.

## Persist notifications and dismissals in two tables

Store one row for every product notification that an instance has fetched.
Retain notification rows and their dismissal rows indefinitely. Removing a
notification from the feed marks it inactive; it doesn't delete any data.

### Store remote notification state in `product_notification`

The `product_notification` table contains the validated remote representation
plus local synchronization state.

| Column            | Type         | Rules                                                        |
| ----------------- | ------------ | ------------------------------------------------------------ |
| `id`              | integer      | Auto-incrementing primary key                                |
| `notification_id` | varchar(255) | Stable remote ID, unique and non-null                        |
| `schema_version`  | integer      | Non-null                                                     |
| `title`           | varchar(255) | Non-null                                                     |
| `content`         | text         | Markdown, non-null                                           |
| `icon`            | varchar(255) | Nullable                                                     |
| `audience`        | varchar(32)  | `admins` or `all_users`                                      |
| `deployment`      | varchar(32)  | `cloud`, `self_hosted`, or `any`                             |
| `edition`         | varchar(32)  | `oss`, `ee`, or `any`                                        |
| `min_version`     | varchar(64)  | Nullable, inclusive lower bound                              |
| `max_version`     | varchar(64)  | Nullable, exclusive upper bound                              |
| `starts_at`       | timestamp    | Non-null UTC timestamp, inclusive                            |
| `ends_at`         | timestamp    | Non-null UTC timestamp, exclusive                            |
| `position`        | integer      | Zero-based position in the complete feed                     |
| `active`          | boolean      | Whether the notification is present in the latest valid feed |
| `retired_at`      | timestamp    | Set when a valid feed first omits the notification           |
| `last_seen_at`    | timestamp    | Last successful sync that contained the notification         |
| `created_at`      | timestamp    | Local creation time                                          |
| `updated_at`      | timestamp    | Local update time                                            |

Add a unique constraint on `notification_id` and an index that supports
selecting active notifications in position order.

`notification_id` identifies immutable remote content. Once an ID has been
successfully persisted, its schema version, content, targeting, and time window
can't change. Reordering the feed may change `position`, and removing an ID may
change `active` and `retired_at`. Any other change under an existing ID rejects
the sync. Authors must use a new ID for a new or changed notification.

### Store per-person state in `product_notification_dismissal`

The `product_notification_dismissal` table contains one row for every person
who dismisses a product notification.

| Column                    | Type      | Rules                         |
| ------------------------- | --------- | ----------------------------- |
| `id`                      | integer   | Auto-incrementing primary key |
| `product_notification_id` | integer   | Non-null foreign key          |
| `user_id`                 | integer   | Non-null foreign key          |
| `dismissed_at`            | timestamp | Non-null                      |

Add these constraints:

- Unique on `(product_notification_id, user_id)`.
- `product_notification_id` references `product_notification.id`.
- `user_id` references `core_user.id` with `ON DELETE CASCADE`.
- Index both foreign-key columns.

Don't expose either internal database ID to the frontend. The API uses the
stable remote `notification_id` as `id`.

## Publish a complete, versioned feed

The static feed is the complete authoritative set of active product
notifications. A valid feed has this shape:

```json
{
  "notifications": [
    {
      "id": "metabase-join-2026-07-22",
      "schema_version": 1,
      "conditions": {
        "audience": "admins",
        "deployment": "cloud",
        "edition": "any",
        "starts_at": "2026-07-22T00:00:00Z",
        "ends_at": "2026-10-06T00:00:00Z",
        "min_version": null,
        "max_version": null
      },
      "title": "We'd love to see you in person",
      "icon": "join_full_outer",
      "content": "OUTER JOIN is taking place Oct 5–7 in Denver. [Register](https://www.metabase.com/events/outer-join-2026)."
    }
  ]
}
```

The array order is the display order. Synchronization derives `position`; feed
authors don't set a separate priority.

Every notification has its own integer `schema_version`. This lets one feed
serve different Metabase versions safely:

- Validate supported schema versions strictly.
- Reject duplicate IDs across the complete feed.
- Reject the complete sync when a notification using a supported schema is
  malformed.
- Skip notifications using a newer, unsupported schema.
- Treat an unsupported representation of an existing ID as absent, so an older
  server doesn't keep displaying stale content under that ID.
- Reject unknown conditions within a supported schema. Ignoring an unknown
  condition could broaden the intended audience.

The publishing workflow must run the same semantic validation before uploading
the feed. It must also reject changes to an ID that appeared in the repository's
feed history. The workflow should publish only from the main Metabase
repository's default branch and retain the existing code-owner review boundary.

Use the same HTTPS and static-hosting trust model as `version-info.json`. Feed
signatures are out of scope.

## Synchronize the feed without losing good data

Implement fetching, validation, reconciliation, and API presentation in separate
namespaces. The synchronization path should follow this order:

```text
fetch
  → decode
  → validate
  → normalize
  → reconcile in one transaction
  → record successful synchronization
```

The HTTP client must use explicit connection and socket timeouts, refuse
unbounded response bodies, and handle non-success responses without trying to
decode them. A network, HTTP, decoding, validation, or database error must leave
all existing rows unchanged.

For every successful feed:

1. Validate and normalize the complete response before opening the write
   transaction.
2. Compare existing IDs with the immutable fields in the incoming feed. Reject
   the transaction if an ID has changed.
3. Insert new supported notifications.
4. Update `position`, `last_seen_at`, and active state for notifications still
   in the feed.
5. Set `active` to false and `retired_at` to the current time for notifications
   absent from the feed.
6. Commit all changes together.

A notification that becomes active again may clear `retired_at`, but it keeps
the same database ID and existing dismissals.

Record an internal `product-notifications-last-synced-at` Setting only after the
transaction commits. Log failed syncs with enough context to distinguish HTTP,
decoding, validation, immutability, and database failures. Never clear existing
rows in an error handler.

## Run one cluster-safe synchronization job

Create a dedicated Quartz job for product notifications:

- Gate the job on the existing `check-for-updates` Setting.
- Don't run the job on air-gapped instances.
- Run twice daily at randomized times.
- Use `DisallowConcurrentExecution`; Metabase's clustered Quartz scheduler
  prevents the same job from running concurrently on multiple nodes.
- Use the do-nothing misfire policy.
- Trigger an immediate sync only when the instance has never completed one or
  when the last successful sync is stale.

Don't modify the version-check job or make product-notification failures affect
version-info updates. Disabling `check-for-updates` must also make the API return
no product notifications, even if rows from an earlier sync remain active.

## Match notifications with explicit rules

Evaluate eligibility on the backend for the current request. A notification is
eligible when all of these conditions pass:

- `active` is true.
- `starts_at <= now < ends_at`, using UTC.
- `audience` is `all_users`, or it is `admins` and the current person is a
  superuser.
- `deployment` is `any`, or it matches Cloud versus self-hosted as reported by
  `premium-features/is-hosted?`.
- `edition` is `any`, or it matches the OSS versus EE build.
- The current Metabase version is within the optional version bounds.
- The current person has not dismissed the notification.

Normalize Metabase's edition-prefixed versions before comparing them:
`v0.64.2` and `v1.64.2` both represent release version `64.2`. Use the existing
Semver4j dependency for parsing and comparison. `min_version` is inclusive and
`max_version` is exclusive. A version-targeted notification doesn't match an
unknown version such as `vLOCAL_DEV`; a notification without version bounds can
still match.

`all_users` includes admins. Version bounds are optional, but `audience`,
`deployment`, `edition`, `starts_at`, and `ends_at` are required. Don't accept
blank strings or implicit wildcard values.

White-label and embedding suppression remain frontend presentation concerns.
The backend doesn't include either in its eligibility rules.

## Expose notifications through a dedicated API

Don't expose product notifications or dismissals as Settings, and don't add
them to `/api/session/properties`.

### Return the existing frontend shape

Add an authenticated endpoint:

```text
GET /api/product-notifications
```

Return a JSON array containing zero or one eligible, undismissed notification by
default. Add `include_all=true` to return every eligible, undismissed
notification in `position` order:

```text
GET /api/product-notifications?include_all=true
```

Both forms return the existing frontend object shape and no internal fields:

```json
[
  {
    "id": "metabase-join-2026-07-22",
    "title": "We'd love to see you in person",
    "content": "OUTER JOIN is taking place Oct 5–7 in Denver.",
    "icon": "join_full_outer"
  }
]
```

Define a Malli response schema. `id`, `title`, and `content` are required;
`icon` is optional. Targeting, schema versions, positions, timestamps, and
internal IDs aren't part of the response.

### Dismiss one eligible notification idempotently

Add an authenticated endpoint:

```text
POST /api/product-notifications/:notification-id/dismiss
```

The endpoint must:

1. Resolve an active, unexpired notification that is eligible for the current
   person.
2. Return `404` for an unknown, inactive, expired, or ineligible ID.
3. Insert the dismissal using the current person's ID.
4. Treat the unique constraint as an idempotency boundary.
5. Return `204 No Content` when the notification was newly or previously
   dismissed.

There is no undismiss endpoint. Dismissals are permanent, and IDs are permanent.

The hardcoded Security Center promo isn't a remotely persisted product
notification and must not use this dismissal table or API.

## Replace the old flow without coupling it to the new tables

The frontend can replace `WhatsNewNotification` with `ProductNotifications`
after the new API is available. The frontend must fetch
`include_all=true` if it needs to reveal the next notification immediately after
a dismissal.

The existing `last-acknowledged-version` user-local Setting doesn't map to the
new immutable notification IDs. Don't migrate it into
`product_notification_dismissal`. Release announcements created in the new
system must use new IDs and should be coordinated so the same announcement
isn't delivered through both systems.

Remove the old announcement publishing workflow only after the product
notification publishing and synchronization paths are deployed. Removing
legacy frontend and Setting code can happen separately once no consumer needs
it.

## Verify failure behavior and boundaries

Backend tests must cover:

- Feed schema validation, duplicate IDs, and unsupported schema versions.
- UTC start-inclusive and end-exclusive boundaries.
- Audience, deployment, edition, and combined targeting.
- Inclusive minimum and exclusive maximum version matching for OSS and EE
  version strings.
- Unknown running versions failing closed only for version-targeted messages.
- Transactional insertion, reordering, retirement, and reactivation.
- Existing IDs rejecting content or targeting changes.
- Fetch, decoding, validation, and database failures preserving existing rows.
- The sync timestamp changing only after a committed transaction.
- `check-for-updates` and air-gap synchronization gates.
- Non-concurrent task metadata, misfire behavior, and startup freshness checks.
- Default API limiting, `include_all`, response schemas, and deterministic
  ordering.
- Per-person dismissal isolation and idempotent repeated dismissal.
- Ineligible IDs returning `404`.
- User deletion cascading dismissal rows.

After adding the module and model references, regenerate the backend module
configuration with `./bin/mage fix-modules-config`.

## Consider the backend complete when these outcomes hold

The backend is ready for frontend integration when:

- A valid published feed becomes queryable without restarting Metabase.
- A bad or unavailable feed never removes the last known good notifications.
- A valid feed update is applied atomically across all notification rows.
- Old Metabase versions never ignore targeting they don't understand.
- Two people can dismiss the same notification independently.
- Concurrent or repeated dismissals can't lose state or create duplicates.
- Disabling update checks or enabling air-gap mode prevents remote fetches.
- The API returns only eligible, undismissed notifications in stable order.
- No product-notification data is exposed through Settings or session
  properties.
