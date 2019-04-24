## Authenticating with SAML
The open source edition of Metabase includes the option to [set up SSO with Google Sign-in or LDAP](https://metabase.com/docs/latest/administration-guide/10-single-sign-on.html), but the Enterprise edition of Metabase additionally lets you connect your SAML- or JWT-based SSO. Integrating your SSO with Metabase allows you to:

* automatically pass user attributes from your SSO to Metabase in order to power data sandboxes
* let your users access Metabase without re-authenticating.

There are slightly different steps to take depending on whether your SSO solution uses SAML or JWT. We'll cover SAML first.

### Enabling SAML authentication

First, head over to the Settings section of the Admin Panel, then click on the Authentication tab. Click the `Configure` button in the SAML section of the Authentication page, and you'll see this form:

![SAML form](images/saml-form.png)

Click the toggle at the top of the form to enable SAML authentication, then fill in the form with the information about your identity provider. **Make sure to turn this on**, otherwise SAML-based authentication won't work, even if all of your settings are right.

Here's a breakdown of each of the settings:

**Identity Provider (IDP) URI:** This is where Metabase will redirect login requests. That is, it's where your users go to log in to your SSO.

**Identity Provider Certificate:** This is a an encoded certificate that we will use when connecting to the IDP provider URI. This will look like a big blob of text that you'll want to copy and paste carefully — the spacing is important!

#### Configuring your SAML identity provider

Metabase will automatically log in Users authenticated with your SAML
identity provider, but in order to do so the SAML assertion *must*
contain attributes for each User's first name, last name, and email. The assertion should look something like the following:

```
<saml2:Assertion
    xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="id4170618837332381492734749" IssueInstant="2019-03-27T17:56:11.067Z" Version="2.0">
    <saml2:Issuer Format="urn:oasis:names:tc:SAML:2.0:nameid-format:entity">http://www.okta.com/Issuer</saml2:Issuer>
    <saml2:Subject>
        <saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">userName</saml2:NameID>
        <saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
            <saml2:SubjectConfirmationData NotOnOrAfter="2019-03-27T18:01:11.246Z" Recipient="https://metabase.mycompany.com/auth/sso"/>
        </saml2:SubjectConfirmation>
    </saml2:Subject>
    <saml2:Conditions NotBefore="2019-03-27T17:51:11.246Z" NotOnOrAfter="2019-03-27T18:01:11.246Z">
        <saml2:AudienceRestriction>
            <saml2:Audience>my-metabase-app</saml2:Audience>
        </saml2:AudienceRestriction>
    </saml2:Conditions>
    <saml2:AuthnStatement AuthnInstant="2019-03-27T17:56:11.067Z">
        <saml2:AuthnContext>
            <saml2:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml2:AuthnContextClassRef>
        </saml2:AuthnContext>
    </saml2:AuthnStatement>
    <saml2:AttributeStatement>
        <saml2:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
            <saml2:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
              Cam
            </saml2:AttributeValue>
        </saml2:Attribute>
        <saml2:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
            <saml2:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
              Saul
            </saml2:AttributeValue>
        </saml2:Attribute>
        <saml2:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
            <saml2:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">
              cam@metabse.com
            </saml2:AttributeValue>
        </saml2:Attribute>
    </saml2:AttributeStatement>
</saml2:Assertion>
```

Most SAML identity providers we've used already include these
assertions by default, but some (such as Okta) must be configured to
include them. Here's an example of what your assertions configuration
should look like in Okta. (You can find this page by going to `Admin > Applications > Metabase > General > SAML Settings [Edit]`).

![Okta SAML Integration](images/saml-okta-setup.png)

You can use other attribute names for these attributes if so desired;
see the section below. The important thing is that first name (given
name), last name (surname), and email address are included as
attributes of the first assertion returned in the identity provider's
SAML response.

##### IMPORTANT NOTE!

The email address *attribute* is used to log in an end user into a
corresponding Metabase account (creating it if needed). Thus it is
extremely critical that this email address MUST NOT be editable by end
users themselves. Otherwise they could potentially access Metabase
accounts other than their own by changing their email address.

#### Settings for signing SSO requests (optional)
These are additional settings you can fill in to sign SSO requests to
ensure they don’t get tampered with.

**SAML keystore path:** the absolute path to the keystore file to use for signing SAML requests.

**SAML keystore password:** if it wasn't already self-evident, this is just the password for opening the keystore.

**SAML keystore alias:** the alias for the key that Metabase should use for signing SAML requests.

#### Settings for user attribute configuration (optional)
These settings allow Metabase to automatically get each user's email address and first and last name.

The settings that Metabase defaults to here might work for you out of the box, but you can override them if you know that your settings are different.

Each of these input boxes needs a URI that points to the location of a SAML attribute.

---

## Next: JWT-based SSO
If SAML isn’t your bag, find out how to enable [JWT-based SSO](authenticating-with-jwt.md).
