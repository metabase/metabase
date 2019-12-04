## Getting and activating the Enterprise edition

The Enterprise edition of Metabase is distinct from the open-source edition, so to use it you'll need to first get a license, get the Enterprise edition, and then activate enterprise features with your license.

You can get a license by signing up for a free trial of the Enterprise edition. [Find out more here](https://metabase.com/enterprise/). Once you sign up for a free trial, you will receive an email containing a license token

To get the Enterprise edition, you can either [download the latest .jar file](https://downloads.metabase.com/enterprise/latest/metabase.jar), or get the [latest Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`

Once you have the Enterprise edition running, to activate all of its features go to the Admin Panel within Metabase, click on the Enterprise tab, click the "Activate a license" button, and then paste in your license token. The page should change to show you that Enterprise features are now active.

### Validating Your Enterprise Token

Your Metabase instance will need to be able to access the internet (specifically `https://store.metabase.com/api/[token-id]/v2/status`) in order to validate your token and grant access to the Enterprise feature set. 

If you need to route outbound Metabase traffic through a proxy on your network, use the following command:

`java -Dhttps.proxyHost=[your proxy's hostname] -Dhttps.proxyPort=[your proxy's port] -jar enterprise_metabase.jar`

Depending on your organization's set-up, additional configuration steps may need to be taken. If the command above does not work for you, we would recommend reaching out to your internal infrastructure or dev ops teams for assistance.

---

## Next: setting up SSO
We'll walk through how to connect your SSO to Metabase, starting with [SAML-based SSO](authenticating-with-saml.md).
