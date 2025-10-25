---
title: "Metabase Cloud versus self-hosting"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
---

# Metabase Cloud versus self-hosting

We have a post that goes into more depth on [why Metabase Cloud might be right for you](https://www.metabase.com/blog/why-metabase-cloud), but here's a (nonexhaustive) table listing some of the differences between Metabase Cloud and self-hosting Metabase.

|                                | Self-hosted OSS                     | Metabase Cloud     |
| ------------------------------ | ----------------------------------- | ------------------ |
| High availability servers      | ~\$48+/month                        | ✅                 |
| Load balancer                  | ~\$12+/month                        | ✅                 |
| Managed database               | ~\$40-60+/month                     | ✅                 |
| SMTP server                    | ~\$12+/month                        | ✅                 |
| Support                        | Forum only (paid plans get support) | Email with SLA     |
| Up and running in minutes      | Manual                              | ✅                 |
| Upgrades                       | Manual                              | ✅                 |
| Multi-zone availability        | Manual                              | ✅                 |
| Backups                        | Manual                              | ✅                 |
| Monitoring                     | Manual                              | ✅                 |
| Keep your own fork of the code | ✅                                  | ❌                 |
| SoC2 Type 2 security auditing  | Manual                              | ✅                 |
| SSL certificate                | Manual                              | ✅                 |
| Where your money goes          | 3rd-party companies                 | Improving Metabase |

Infrastructure costs are tricky to estimate, so keep in mind that the above self-hosting prices are ballpark estimates for a comparable setup with other cloud providers. If you _really_ know what you're doing, you can price out a cheaper setup, but then the services aren't managed and you don't get official support (which alone might make Cloud the better choice). We're just trying to provide an anchor to compare against for a similar production-grade setup, and anyway, you can always start out with Cloud and move to self-hosting whenever.

## When _should_ you self-host?

There are some cases where you _should_ self-host.

- You have some regulations that stipulate how you run your software (like HIPAA).
- You want to run a custom build of Metabase. That is, you’re running a fork of Metabase (OSS or the Enterprise/Pro version) so you can add your own customizations to the software, and you have the engineering resources to tank that level of overhead.
- You want to use a community or custom driver. We only support [official databases](../databases/connecting.md#connecting-to-supported-databases) on Metabase Cloud, because we need to be able to vouch for their quality and help you with problems in a production context.
- You need an air-gapped environment, usually for regulatory compliance, or if you’re running your own three-letter-agency… If you’re not sure if you need an air-gapped environment, you don’t need an air-gapped environment. If you do need an air-gap, we have an [air-gap offering as well](https://www.metabase.com/product/air-gapping) (just not for Cloud, obviously).

Otherwise, you're better off having us handle all of the overhead so you can focus on your business. The official support alone is probably worth it.

## Metabase Pro and Enterprise

Metabase also has a paid version that ships with all of the bells and whistles (SSO, row-level permissions, customization, and a lot more). Plans with this version include:

- [Metabase Pro](https://www.metabase.com/product/pro)
- [Metabase Enterprise](https://www.metabase.com/product/enterprise)

You can self-host this paid version, or have us host it for you on Metabase Cloud for no additional cost. We don't charge more because we believe you'll have such a better experience that it'll be easier for us to support you.
