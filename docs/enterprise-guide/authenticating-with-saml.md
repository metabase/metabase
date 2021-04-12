## Using Azure AD as the Identity Provider with Metabase and SAML

To enable SAML authentication and use Azure AD as an identity provider you need to have the Enterprise edition of Metabase. Check out a general guide about how to enable SAML authentication in the "Authenticating with SAML" [guide](authenticating-with-saml.html)

## Steps
- Enable SAML in Metabase (not covered in this guide)
- Add an Enterprise Application in Azure AD
- Configure the Enterprise Application with Metabase SSO information

### Add an Enterprise Application in Azure AD

Go to the Azure Active Directory (AD) where your users live and click on **Enterprise Applications**. Once there, click on "+ New Application" in the bar on the top of the page.

[!AZEnterpriseApp](images/saml-azure-ad-enterprise-app.png)

In the new page click on "+ Create your own application" and a bar will open in the right side of the page. Enter "Metabase" as the name of the application and select `Integrate any other application you don't find in the gallery (Non-gallery)` as the option and click the "Create" button on the bottom of the bar.

[!AZMetabaseApp](images/saml-azure-ad-create.png)

In the application page, click in "Single Sign-on" under the Manage tab and then click on the "SAML" button.

[!AZAppSAML](images/saml-azure-app-saml.png)

When the "Set up Single Sign-On with SAML" page appears, click on the "Edit" button on step 1:

[!AZAzureStep1](images/saml-azure-step-1.png)

Fill out the following boxes:
- Identifier (Entity ID): `Metabase`
- Reply URL (Assertion Consumer Service URL): the value that your Metabase instance reports in the "Configure your identity provider (IdP)" and ends in "/auth/sso"

Click "Save"

Now, open in a new tab the link that's in "App Federation Metadata Url" from step 3 and save the "Login URL" and "Azure AD Identifier" links from step 4 as you will need them both in the next step.

To finish the Azure side of the configuration, click on the "Users and groups" button on the Manage tab and add the users or groups which will be able to use Metabase Application. Take into account that you can allow/deny the use of Metabase to different groups in your organization.

### Configure the Enterprise Application with Metabase SSO information

Go to Metabase, log in as an administrator and go to Admin->Settings->Authentication->SAML.

You need to enter the following configurations on "Tell Metabase about your identity provider".
- SAML Identity Provider URL: the "Login URL" you got on Step 4 on the Azure AD SAML SSO configuration 
- SAML Identity Provider Certificate: copy and paste the super long string under the "<X509Certificate>" tag in the "App Federation Metadata Url". Make sure you copy and paste the whole string as if you miss any character the integration won't work.
- SAML Application Name: "Metabase"
- SAML Identity Provider Issuer: the "Azure AD Identifier" URL you got on Step 4 on the Azure AD SAML SSO configuration

Click on "Save Changes" below and try to log in in an incognito window with your browser with a user that exists in AD in Metabase.