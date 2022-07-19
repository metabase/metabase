---
title: Activating your Metabase commercial license
---

# Activating your Metabase commercial license

The paid Pro and Enterprise editions of Metabase are distinct from the free Open Source edition, so to use your paid features you’ll need to first get a license. And if you want to self-host, you'll need a different JAR or Docker image that you can use to activate the advanced features with your license token.

## Where to get a license

You can get a license by signing up for a free trial of the [Pro or Enterprise edition plans](https://www.metabase.com/pricing), both of which can be self-hosted or hosted on Metabase Cloud.

If you sign up for a Metabase Cloud option, you're already good to go.

## How to activate your token when self-hosting

If you chose to host Metabase yourself, you'll get an email containing a unique license token. But to use it, you'll need to install the right JAR file.

You can either:

- [Download the latest metabase-enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar) (the filename is the same, irrespective of your plan), or
- [Get the latest Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`. 

Run Metabase as you would normally, then go to __Settings__ > __Admin settings__, and click __License and Billing__ in the lefthand sidebar. Paste in your license token under __License__ and click __Activate__.

## **Validating your token**

Your Metabase needs to be able to access the internet (specifically `https://store.metabase.com/api/[token-id]/v2/status`) in order to validate the token and maintain access to the advanced features.

If your Metabase can't validate the token, it'll disable the advanced features, but will continue to work normally otherwise, as if it were the Open Source edition.

In case you need to route outbound Metabase traffic through a proxy on your network, use the following command when starting Metabase:

```
java -Dhttps.proxyHost=[your proxy's hostname] -Dhttps.proxyPort=[your proxy's port] -jar enterprise_metabase.jar
```

Depending on your organization’s setup, you may need to take additional configuration steps. If the command above doesn't work for you, we recommend reaching out to your internal infrastructure or dev ops teams for assistance.

---

## Next: setting up SSO
We'll walk through how to connect your SSO to Metabase, starting with [SAML-based SSO](authenticating-with-saml.md).
