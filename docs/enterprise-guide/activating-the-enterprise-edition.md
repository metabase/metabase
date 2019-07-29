## Getting and activating the Enterprise edition

The Enterprise edition of Metabase is distinct from the open-source edition, so to use it you'll need to first get a license, get the Enterprise edition, and then activate enterprise features with your license.

You can get a license by signing up for a free trial of the Enterprise edition. [Find out more here](https://metabase.com/enterprise/). Once you sign up for a free trial, you will receive an email containing a license token

To get the Enterprise edition, you can either [download the latest .jar file](https://downloads.metabase.com/enterprise/latest/metabase.jar), or get the [latest Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`

Once you have the Enterprise edition running, to activate all of its features go to the Admin Panel within Metabase, click on the Enterprise tab, click the "Activate a license" button, and then paste in your license token. The page should change to show you that Enterprise features are now active.

Please note that if you are running Metabase via a proxy, you may need to complete some additional configuration steps. Metabase will need to be able to access `https://store.metabase.com/api/[token-id]` in order to validate your token and turn on the Enterprise feature set. This may include unblocking port `80` and `443` to allow Metabase to make an outgoing connection. If you're unsure of how to do this, please contact your organization's ops or infrastructure team.

---

## Next: setting up SSO
We'll walk through how to connect your SSO to Metabase, starting with [SAML-based SSO](authenticating-with-saml.md).
