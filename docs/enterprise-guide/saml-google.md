---
title: Setting up SAML with Google
---

# Setting up SAML with Google

{% include plans-blockquote.html feature="Google SAML authentication" %}

1. Set up a [custom SAML application](https://support.google.com/a/answer/6087519) with Google (the identity provider).
2. [Configure SAML in Metabase](../enterprise-guide/authenticating-with-saml.html#enabling-saml-authentication-in-metabase) (the service provider).

For more information, check out our guide for [authenticating with SAML](../enterprise-guide/authenticating-with-saml.html).

## How to fill out SAML settings in Google and Metabase

| Metabase SAML                       | Google SAML                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL the IdP should redirect back to | Google Admin console > Service Provider Details > ACS URL. This is the same as your Metabase URL -- it should start with `https://` and end with `/auth/sso`. |
| Users email attribute               | Google Admin console > Attribute mapping                                                                                                                      |
| Users first name attribute          | Google Admin console > Attribute mapping                                                                                                                      |
| Users last name attribute           | Google Admin console > Attribute mapping                                                                                                                      |
| SAML Identity Provider URL          | Google Admin console > Google Identity Provider details > Copy the **SSO URL**                                                                                |
| SAML Identity Provider Certificate  | Google Admin console > Google Identity Provider details > Download certificate                                                                                |
| SAML Application Name               | Google Admin console > Google Identity Provider details > Copy the **Entity ID**                                                                              |
| SAML Identity Provider Issuer       | Google Admin console > Google Identity Provider details > Download metadata                                                                                   |

## Troubleshooting SAML issues

For common issues, go to [Troubleshooting SAML](../troubleshooting-guide/saml.html).