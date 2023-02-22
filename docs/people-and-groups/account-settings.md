---
title: Account settings
redirect_from:
  - /docs/latest/users-guide/account-settings
---

# Account settings

You can view your account settings by going to the top right of the screen and clicking on the **gear** icon > **Account settings**.

## Account profile

You can set your first and last names, change your email address, and set your language. See our list of [supported languages](../configuring-metabase/localization.md).

## Account password

You can change your password here. Note that if your Metabase uses Single Sign-On (SSO), your administrator will have disabled this password section, as your identity provider will manage logins.

If you're having trouble logging in, see our [People can't log into Metabase](../troubleshooting-guide/cant-log-in.md).

## Account login history

The login history lists each login, along with some location information (if available), and some client information (like Browser (Firefox/Windows)).
If you see any suspicious login attempts, change your password and notify your administrator.

### A note about new login emails

Whenever you log in from a new device, Metabase will send you an email just to let you know someone (presumably you) has logged in from an unrecognized device. If you see this email, but don't remember logging in, or don't recognize the device, change your password and let your administrator know.

## Disable animations in Metabase

This isn't an in-Metabase setting, but just so you know: you can disable UI animations in Metabase (like sidebars sliding around, or rotating spinners) by changing the settings for your operating system so it respects the `prefers-reduced-motion` CSS media feature. This change will also affect other applications, not just Metabase. Check out the instructions for how to set the user preferences for your operating system in the [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion#user_preferences).

## Notifications

If you subscribe or are added to dashboard subscriptions or alerts, you’ll be able to manage those notifications here (as well as on the relevant question or dashboard themselves).
