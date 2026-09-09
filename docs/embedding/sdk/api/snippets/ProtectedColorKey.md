```ts
type ProtectedColorKey =
  | "metabase-brand"
  | "metabase-brand-hover"
  | "admin-navbar"
  | "admin-navbar-secondary"
  | "admin-navbar-inverse"
  | "upsell-primary"
  | "upsell-secondary"
  | "upsell-gem"
  | "core-metabase_brand"
  | "core-metabase_brand-hover"
  | "navbar-admin"
  | "navbar-admin-secondary"
  | "navbar-admin-inverse"
  | "accent0"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4"
  | "accent5"
  | "accent6"
  | "accent7";
```

Color keys that are protected and should not be exposed to embedding.

Do not derive this from `PROTECTED_COLORS` or doc generation will fail.
