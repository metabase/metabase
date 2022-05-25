# Setting up SAML with Google

{% include plans-blockquote.html feature="Google SAML authentication" %}

Follow the steps in Google's documentation to [set up your own custom SAML application](https://support.google.com/a/answer/6087519?hl=en).

You can configure SAML in Metabase from **Admin settings** > **Authentication** > **SAML**.

| Metabase SAML                       | Google SAML                                                                                                                                    |
|-------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| URL the IdP should redirect back to | Google Admin console > Service Provider Details > ACS URL. Enter your Metabase url (should start with `https://` and end with `/auth/sso`)     |
| Users email attribute               | Google Admin console > Attribute mapping                                                                                                       |
| Users first name attribute          | Google Admin console > Attribute mapping                                                                                                       |
| Users last name attribute           | Google Admin console > Attribute mapping                                                                                                       |
| SAML Identity Provider URL          | Google Admin console > Google Identity Provider details > Copy the **SSO URL**                                                                 |
| SAML Identity Provider Certificate  | Google Admin console > Google Identity Provider details > Download certificate                                                                 |
| SAML Application Name               | Google Admin console > Google Identity Provider details > Copy the **Entity ID**                                                               |
| SAML Identity Provider Issuer       | Google Admin console > Google Identity Provider details > Download metadata                                                                    |
