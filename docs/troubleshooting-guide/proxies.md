If you're experiencing problems where attempting to save a question or dashboard sometimes fails, or Metabase only loads a blank page, this might be caused by the use of a proxy.

A proxy could include other functions like a web application firewall (WAF), content optimization, or cache.

Examples of proxies that are known to cause issues with Metabase:

- Cloudflare's Rocket Loader and WAF
- Azure's WAF
- PageSpeed module for e.g., Apache
- Some anti-virus browser extensions or add-ons

## Specific Problems

### Saving questions/dashboards fails

If saving questions/dashboards fails with the button changing to `Save Failed` or perhaps with the error `Sorry you do not have permission to see that`, then it might be caused by either a WAF like Cloudflare or Azure.

- Check the browser developer Console-tab for any errors, when the save fails.
- Also check the browser developer Network-tab, when the save fails, to see the request. It will usually fail with a code `403`, and the error is coming from the WAF and not Metabase.
  Clicking on the request will show more information, and looking at the headers will usually indicate where it originated from.

Some WAFs have dynamic protection, which means that it might only become a problem after an upgrade of Metabase, and might go away after a few days.

The solution is to disable the WAF for Metabase. Some services will show which rules were triggered, so it might be enough to disable those rules.

### Blank page (instead of the Metabase interface)

If Metabase just loads a blank page instead of the interface, then it is usually caused by content optimization like PageSpeed or Cloudflare's Rocket Loader.

- Check the browser developer console for any errors involving Content Security Policy (CSP)
- See if Metabase has been able to deliver the HTML code by right clicking the blank page and selecting `View page source`. It might look gibberish, but it should say `<title>Metabase</title>` on about line 25

The solution is to disable the content optimization for Metabase.
