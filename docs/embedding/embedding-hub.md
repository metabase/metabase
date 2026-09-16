---
title: Embedding hub
summary: The Embedding hub is where admins turn on embedding methods and manage CORS, secret keys, JWT, permissions, tenants, themes, and translations for embeds.
---

# Embedding hub

Embedding settings live in the Embedding hub. To open it, click the **grid** icon in the upper right and select **Embedding hub**. Only admins can see it.

## Pages in the Embedding hub

- **Get started**: a checklist that walks you through your first embed. The first section covers connecting a database, creating a dashboard, and getting an embed snippet. The second section covers permissions and tenants, SSO, a production embed with SSO, custom themes, and AI, with a short wizard for the permissions and SSO steps.
- **Security**: one toggle that turns on modular embedding, the SDK for React, and guest embeds, plus a separate **Full-app embedding** toggle on Pro and Enterprise plans. This page also has CORS origins, the secret key for guest embeds, and a list of published guest embeds. On Pro and Enterprise plans, it also has the SameSite cookie setting and, once full-app embedding is on, the authorized origins for full-app embeds.
- **Authentication**: JWT settings for [SSO](./authentication.md). For SAML and other options, head to **Admin > Settings > Authentication**.
- **Permissions**: the same permissions editor as **Admin > Permissions**.
- **Tenancy**: [tenants](./tenants.md), tenant groups, and tenant users.
- **Appearance**: [themes](./appearance.md) for your embeds, plus the loading message and empty-state illustrations. If full-app embedding is on, this page points you to **Admin > Settings > Appearance** for the colors and branding of full-app embeds.
- **Localization**: [translation dictionaries](./translations.md) for embedded content.

## Creating a new embed from the hub

The **New embed** button at the bottom of the sidebar opens the embed wizard. You can also open the wizard from anywhere in Metabase with the command palette (Ctrl/Cmd+K, then type "New embed") or with the keyboard shortcut `c` followed by `e`.

## Which plans see which pages

Every plan sees every page in the hub. On OSS and Starter plans, the Authentication, Tenancy, Appearance, and Localization pages show what's available on [Pro and Enterprise](https://www.metabase.com/pricing) plans instead of the settings themselves.

## Links to the old embedding settings

If you have links or bookmarks to the old **Admin > Embedding** pages, they'll redirect to the matching hub page.

## Further reading

- [Embedding introduction](./introduction.md)
- [Modular embedding](./modular-embedding.md)
- [Full app embedding](./full-app-embedding.md)
