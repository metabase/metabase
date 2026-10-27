---
title: Serve data apps from a separate address
summary: Set MB_ISOLATED_ORIGIN to serve data apps from a second address for your Metabase, one that browsers never send the Metabase session cookie to.
---

# Serve data apps from a separate address

A data app runs code from the Git repository you connect to Metabase. On a self-hosted Metabase, you can serve data apps from a second address for the same Metabase, so that code never runs next to people's Metabase sessions. You set the second address with the [`MB_ISOLATED_ORIGIN`](./environment-variables.md#mb_isolated_origin) environment variable; there's no Admin setting for it.

Browsers never send the Metabase session cookie to the second address. A data app served from there can reach Metabase only through the Metabase page that shows it, and that page passes on only the requests that data apps are allowed to make.

## Set up the second address

1. Pick a host name on a separate domain. If your Metabase runs at `metabase.example.com`, use something like `example-isolated.com`.

   A subdomain like `apps.example.com` also works, but browsers treat all subdomains of `example.com` as one site, and attach the Metabase session cookie to requests from one subdomain to another. Metabase guards against such requests, but with a separate domain, browsers don't send the cookie in the first place.

2. Point the host name at the same Metabase: add a DNS record, a TLS certificate, and a rule in your reverse proxy or load balancer. The proxy must pass on the host name the browser used, in the `Host` or `X-Forwarded-Host` header. That's how Metabase tells the two addresses apart.

3. Make sure your Metabase has a [Site URL](./settings.md#site-url). Only pages at the Site URL can show data apps from the second address.

4. Set the environment variable to the second address, then restart Metabase:

   ```
   MB_ISOLATED_ORIGIN=https://example-isolated.com
   ```

If Metabase runs under a path, like `https://metabase.example.com/analytics`, serve it under the same path on the second address (`https://example-isolated.com/analytics`). `MB_ISOLATED_ORIGIN` only needs the scheme and host name; Metabase ignores any path in it.

## Metabase turns data apps off when it can't use the address

Metabase only uses the second address when:

- A Site URL is set.
- The address has a different host name from the Site URL. A different port isn't enough, since the session cookie reaches every port of a host.
- The address uses `https` when the Site URL does. A page on `https` can't show a data app from `http`.

If `MB_ISOLATED_ORIGIN` breaks one of these requirements, Metabase turns data apps off rather than serving them without the second address. The data app page says **Data apps are unavailable**, and the [server logs](../monitor/application-logs.md) have an error that starts with `MB_ISOLATED_ORIGIN` and explains which requirement the value breaks.

## People keep opening data apps at the Site URL

People open data apps at the Site URL, as before. Only the app inside the page loads from the second address. If someone opens a data app at another address for your Metabase, Metabase asks them to open it at the Site URL instead.

The second address serves only data apps and the files they load. Everything else there, including sign-in and the API, returns a 404. The health check at `/api/health` works on both addresses, so your load balancer can check either one.

## Turn the second address off

Remove `MB_ISOLATED_ORIGIN` and restart Metabase. Data apps then load from the same address as the page that shows them.
