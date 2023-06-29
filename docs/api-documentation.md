---
title: "Metabase API documentation"
---

# Metabase API documentation

_These reference files were generated from source comments by running:_

```
clojure -M:ee:run api-documentation
```

## About the Metabase API

- **The API is subject to change.** The API is tightly coupled with the front end and is subject to change between releases. The endpoints likely won’t change that much (existing API endpoints are changed infrequently, and removed rarely), but if you write code to use the API, you might have to update it in the future.
- **The API isn't versioned.** Meaning: it can change version to version, so don’t expect to stay on a particular version of Metabase in order to use a “stable” API.

## API tutorial

Check out an introduction to the [Metabase API](https://www.metabase.com/learn/administration/metabase-api.html).

## API endpoints

_* indicates endpoints used for features available on [paid plans](https://www.metabase.com/pricing)._


- [Action](api/action.md)
- [Activity](api/activity.md)
- [Advanced config logs*](api/ee/advanced-config-logs.md)
- [Advanced permissions application*](api/ee/advanced-permissions-application.md)
- [Alert](api/alert.md)
- [Audit app user*](api/ee/audit-app-user.md)
- [Automagic dashboards](api/automagic-dashboards.md)
- [Bookmark](api/bookmark.md)
- [Card](api/card.md)
- [Collection](api/collection.md)
- [Content management review*](api/ee/content-management-review.md)
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
- [Metric](api/metric.md)
- [Native query snippet](api/native-query-snippet.md)
- [Notify](api/notify.md)
- [Permissions](api/permissions.md)
- [Persist](api/persist.md)
- [Premium features](api/premium-features.md)
- [Preview embed](api/preview-embed.md)
- [Public](api/public.md)
- [Pulse](api/pulse.md)
- [Revision](api/revision.md)
- [SSO*](api/ee/sso.md)
- [Sandbox GTAP*](api/ee/sandbox-gtap.md)
- [Sandbox table*](api/ee/sandbox-table.md)
- [Sandbox user*](api/ee/sandbox-user.md)
- [Search](api/search.md)
- [Segment](api/segment.md)
- [Serialization serialize*](api/ee/serialization-serialize.md)
- [Session](api/session.md)
- [Setting](api/setting.md)
- [Setup](api/setup.md)
- [Slack](api/slack.md)
- [Table](api/table.md)
- [Task](api/task.md)
- [Tiles](api/tiles.md)
- [Timeline](api/timeline.md)
- [Timeline event](api/timeline-event.md)
- [Transform](api/transform.md)
- [User](api/user.md)
- [Util](api/util.md)