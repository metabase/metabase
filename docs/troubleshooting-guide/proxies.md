---
title: Can't save questions or dashboards, or getting a blank page
---

# Can't save questions or dashboards, or getting a blank page

If attempting to save a question or dashboard sometimes fails, or Metabase only loads a blank page, the problem might be the use of a proxy. A proxy could include other functions like a web application firewall (WAF), content optimization, or cache. Examples of proxies that are known to cause issues with Metabase include:

- Cloudflare's Rocket Loader and WAF
- Azure's WAF
- PageSpeed module for Apache
- Some anti-virus browser extensions or add-ons

## Saving questions or dashboards fails

If saving questions or dashboards fails and the save button displays "Save Failed," or if you get the error, "Sorry you do not have permission to see that," the problem might be with a WAF like Cloudflare or Azure.

- When the save fails, check the Console tab of your browser's Developer Tools for any errors.
- You should also check the Network tab in the Developer Tools in your browser to view the network request. It will usually fail with error code 403, indicating the error is coming from the WAF and not Metabase.

Clicking on the request will show more information, and looking at the headers will usually indicate where it originated from.

Some WAFs have dynamic protection, which means that the problem might only occur after an upgrade of Metabase, and might go away after a few days.

The solution is to disable the WAF for Metabase. Some services will show which rules were triggered, so it might be enough to disable those rules.

## Seeing a blank page instead of the Metabase interface

If Metabase displays a blank page instead of its interface, the problem is usually with content optimization like PageSpeed or Cloudflare's Rocket Loader.

- Check the Console tab of your browser's Developer Tools for any errors involving Content Security Policy (CSP).
- See if Metabase has been able to deliver the HTML code by right clicking on the blank page and selecting "View page source." It might look like gibberish, but it should say `<title>Metabase</title>` near line 25.

The solution is to disable content optimization for Metabase.
