# Data Apps Main Navbar Design

## Goal

Make every signed-in user aware of the enabled data apps available on the
Metabase instance by listing them in a flat, collapsible section in the main
navbar.

## Backend contract

`GET /api/apps` will be readable by every authenticated user. The endpoint will
continue returning all data apps, including disabled apps, in display-name
order. This is an intentional beta contract: data apps do not have their own
permission model, and every user may see every app name.

All management operations remain restricted to administrators:

- `GET /api/apps/repo-status`
- `PUT /api/apps/:slug`
- `DELETE /api/apps/:slug`

Opening an individual app and fetching its bundle retain their existing rules:
only enabled apps are served.

## Frontend architecture

The shared main navbar will render a new component slot exposed by
`PLUGIN_DATA_APPS`. The OSS implementation remains empty. When the Data Apps
premium feature is active, the enterprise plugin supplies a focused navbar
section component that uses the existing `useListDataAppsQuery` hook.

This preserves the existing OSS/enterprise boundary: shared navbar code does
not import an enterprise API module, and Data Apps owns its own fetching and
presentation logic.

## Navbar behavior

The Data Apps section appears directly below Library. It:

- is titled "Data Apps";
- is expanded by default and can be collapsed with the standard navbar section
  control;
- filters the list response to apps whose `enabled` property is `true`;
- displays enabled apps as one flat list, without folders or nesting;
- uses each app's `display_name` as the label;
- links each item to `/apps/:slug` using the canonical data-app URL helper;
- follows the endpoint's display-name ordering;
- closes the mobile navbar after an app is selected; and
- is hidden when the feature is unavailable, no enabled apps exist, the query
  is loading, or the query fails.

Hiding the section on request failure keeps the rest of the main navbar usable;
the existing query infrastructure remains responsible for request diagnostics.

## Testing

Backend tests will prove that a normal signed-in user can list apps while repo
status and mutations remain administrator-only. The list test will cover both
enabled and disabled rows so the public endpoint contract is explicit.

Focused frontend tests will cover:

- rendering enabled apps and excluding disabled apps;
- correct app labels and links;
- collapsing and expanding the section;
- hiding the section for an empty enabled list; and
- hiding the section when the request fails.

Existing Data Apps route and bundle tests continue to cover whether an app can
actually be opened.
