---
title: "Metabase API documentation"
---

# Metabase API documentation

_These reference files were generated from source comments by running:_

```
clojure -M:ee:run api-documentation
```

## About the Metabase API

- **The API is subject to change.** We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.
- **The API isn't versioned.** So don’t expect to stay on a particular version of Metabase in order to use a “stable” API.

## API tutorial

Check out an introduction to the [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## API keys

Create keys to authenticate programmatic requests to your Metabase. See [API keys](./people-and-groups/api-keys.md).

## API endpoints

_* indicates endpoints used for features available on [paid plans](https://www.metabase.com/pricing)._


- [Action](api/action.md)
- [Activity](api/activity.md)
- [Advanced config logs*](api/ee/advanced-config-logs.md)
- [Advanced permissions application*](api/ee/advanced-permissions-application.md)
- [Advanced permissions impersonation*](api/ee/advanced-permissions-impersonation.md)
- [Alert](api/alert.md)
- [API key](api/api-key.md)
- [Audit app user*](api/ee/audit-app-user.md)
- [Automagic dashboards](api/automagic-dashboards.md)
- [Bookmark](api/bookmark.md)
- [Card](api/card.md)
- [Collection](api/collection.md)
- [Content verification review*](api/ee/content-verification-review.md)
- [Dashboard](api/dashboard.md)
- [Database](api/database.md)
- [Dataset](api/dataset.md)
- [Email](api/email.md)
- [Embed](api/embed.md)
- [Field](api/field.md)
- [GeoJSON](api/geojson.md)
- [Google](api/google.md)
- [LDAP](api/ldap.md)
- [Login history](api/login-history.md)
- [Metabot](api/metabot.md)
- [Metric](api/legacy-metric.md)
- [Model index](api/model-index.md)
- [Native query snippet](api/native-query-snippet.md)
- [Notify](api/notify.md)
- [Permissions](api/permissions.md)
- [Persist](api/persist.md)
- [Premium features](api/premium-features.md)
- [Preview embed](api/preview-embed.md)
- [Public](api/public.md)
- [Pulse](api/pulse.md)
- [Revision](api/revision.md)
- [Sandbox GTAP*](api/ee/sandbox-gtap.md)
- [Sandbox table*](api/ee/sandbox-table.md)
- [Sandbox user*](api/ee/sandbox-user.md)
- [Search](api/search.md)
- [Segment](api/segment.md)
- [Serialization*](api/ee/serialization.md)
- [Session](api/session.md)
- [Setting](api/setting.md)
- [Setup](api/setup.md)
- [Slack](api/slack.md)
- [SSO*](api/ee/sso.md)
- [SSO SAML](api/sso-saml.md)
- [Table](api/table.md)
- [Task](api/task.md)
- [Tiles](api/tiles.md)
- [Timeline](api/timeline.md)
- [Timeline event](api/timeline-event.md)
- [User](api/user.md)
- [Util](api/util.md)
