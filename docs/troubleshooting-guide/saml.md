---
title: Troubleshooting SAML authentication setup
---

# Troubleshooting SAML authentication setup

{% include plans-blockquote.html feature="SAML authentication" %}

Some common problems when setting up SAML.

## Does your app support SAML?

Verify that the application you created in your IdP supports SAML. Sometimes other options are presented during the app creation process.

## Is the issuer or entity ID correct?

After filling out the authentication form with your identity provider, you're taken back to Metabase but it throws an error. To see the error, go to **Admin settings** > **Troubleshooting** > **Logs**. You'll see an error that says something like **Incorrect response <issuer\>**.

**Root cause**: Your issuer or entity ID is incorrect.

**Steps to take**:

1. You should have received an XML file of metadata from your identity provider. Open that metadata file, and look for the correct issuer or entity ID. This ID is a unique identifier for the identity provider. Depending on your provider, the issuer or entity ID usually looks something like this:
   ```
   http://www.example.com/141xkex604w0Q5PN724v
   ```
2. Copy the issuer or entity ID from the XML file.
3. Go to Metabase and select **Admin settings** > **Settings** > **Authentication** > **SAML**. Enter the issuer or entity ID into the **SAML Identity Provider Issuer** field.

## Is the SAML identity provider certificate value correct?

After filling out the authentication form with your identity provider, you go back to Metabase but it throws an error. Go to **Admin settings** > **Troubleshooting** > **Logs**. You'll see an error that says something like **Invalid assertion error <issuer\>**.

**Root cause**: The certificate value you entered is incorrect.

**Steps to take**:

1. Go to Metabase and select **Admin settings** > **Settings** > **Authentication** > **SAML**. Check that the certificate that you entered into the **SAML Identity Provider Certificate** field matches the certificate in the XML file you got from your identity provider.

   - Depending on your provider, you might need to download the XML file, open it in a text editor, then copy and paste the certificate's contents into the **SAML Identity Provider Certificate** field in Metabase.

   - Note that your certificate text may include header and footer comments that look like `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`. These comments should be included when pasting your certificate text into Metabase.

## Is the SSO URL correct?

Verify that the Single Sign On URL (or equivalent) that you enter on your SAML provider’s website has `/auth/sso` appended to it. For instance, if you want your users to end up at `https://metabase.mycompany.com`, the full URL should be `https://metabase.mycompany.com/auth/sso`.

## Searching for private key and found a null

This error will only occur if you're using **Signed SSO requests**. That is, in Metabase, you've filled out the fields in the configuration section in **Admin settings** > **Settings** > **Authentication** > **SAML** > **Signed SSO requests**. Those fields are:

- **SAML Keystore Path**: the absolute path to the Keystore file to use for signing SAML requests.
- **SAML Keystore Password**: the password for opening the keystore.
- **SAML Keystore Alias**: the alias for the key that Metabase should use for signing SAML requests.

**Root cause**: The certificate in the keystore file lacks a private key.

**Steps to take**:

1. Add a certificate with a private key to your keystore.

## Checking if SAML is working correctly

Go to your Metabase login page. If SAML is working correctly, you should see [a single button to sign in](https://www.metabase.com/glossary/sso) with your identity provider (IdP). Once you're authenticated, you should be automatically redirected to the Metabase home page.

## Are you still stuck?

If you can’t solve your problem using the troubleshooting guides:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
