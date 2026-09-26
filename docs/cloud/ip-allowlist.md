---
title: "IP allowlist"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
---

# IP allowlist

Use an IP allowlist to limit access to your Metabase instance to approved IP addresses. The allowlist applies to all access to your instance, so people outside the allowlist can't reach the API, embedded dashboards and questions, or public links.

IP allowlists are only available on Metabase Cloud [Pro or Enterprise](https://www.metabase.com/pricing) plans. To restrict access to a self-hosted Metabase, use your own firewall or load balancer, or consider [air-gapping](https://www.metabase.com/product/air-gapping).

The allowlist accepts IPv4 addresses and CIDR ranges. Metabase treats a bare IPv4 address as a `/32` range.

By default, restricting access by IP address is turned off.

To allow Metabase to reach your databases, see [IP addresses to whitelist](./ip-addresses-to-whitelist.md).

## Set up an IP allowlist

When you save an allowlist, your instance restarts. Metabase blocks requests from addresses outside the allowlist, so include the address or range you're connecting from before you save.

The allowlist doesn't apply to the Metabase Store. If you leave out your own address, you can still log in to the Store and update the allowlist.

1. Log in to your Metabase [Store account](https://store.metabase.com).
2. Navigate to **Instances**.
3. In the instance you want to restrict access to, click **Settings**.
4. Scroll to **IP allowlist**.
5. Enable the **Restrict access by IP address** toggle.
6. In the **IP/CIDR ranges** field, enter an IPv4 address or a CIDR range.
7. To add more addresses, enter them in the empty field. To add several at once, paste a list with one address or range per line.
8. Click **Save**.
9. Review the warning, then confirm. Your instance restarts.

Metabase validates each entry as you type. To save the allowlist, you must first correct or remove invalid entries.

To remove an address, click the trash icon next to the address or range, then click **Save**.

## Turn off the IP allowlist

When you turn off the IP allowlist and save, Metabase clears the saved addresses. To restrict access again, you must re-enter the addresses.

Turning off the allowlist doesn't remove authentication. People still need to sign in to your Metabase.

In your instance's **IP allowlist** settings:

1. Disable the **Restrict access by IP address** toggle.
2. Click **Save**.

## Further reading

- [IP addresses to whitelist](./ip-addresses-to-whitelist.md)
- [Changing your domain name](./custom-domain.md)