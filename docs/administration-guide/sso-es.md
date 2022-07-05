***

## title: Configuración del inicio de sesión único (SSO)

## Configuración del inicio de sesión único (SSO)

Le recomendamos que configure [Inicio de sesión único][sso-def] para la instalación de la Metabase.

## SSO para Metabase Open Source Edition

*   [Inicio de sesión de Google][google-sign-in]
*   [LDAP][ldap]

## SSO para las versiones de pago de Metabase

Con las versiones de pago, tiene más opciones para ayudar a administrar muchas personas y grupos.

*   [JWT][jwt]
*   Funciones avanzadas de LDAP
    *   [Filtro de pertenencia a grupos][ldap-group-membership-filter]
    *   [Sincronización de atributos de usuario][ldap-user-attributes]
*   [SAML][saml]
    *   [Configuración de SAML con Auth0][saml-auth0]
    *   [Configuración de SAML con Google][saml-google]
    *   [Configuración de SAML con Keycloak][saml-keycloak]
    *   [Documentación para otros IdPs comunes][saml-other-idps]

[google-sign-in]: ./10-single-sign-on.html#enabling-google-sign-in

[jwt]: ../enterprise-guide/authenticating-with-jwt

[ldap]: ./10-single-sign-on.html#enabling-ldap-authentication

[ldap-group-membership-filter]: ./10-single-sign-on.html#ldap-group-membership-filter

[ldap-user-attributes]: ./10-single-sign-on.html#syncing-user-attributes-with-ldap

[saml]: ../enterprise-guide/authenticating-with-saml.html

[saml-auth0]: ../enterprise-guide/saml-auth0.html

[saml-google]: ../enterprise-guide/saml-google.html

[saml-keycloak]: ../enterprise-guide/saml-keycloak.html

[saml-other-idps]: ../enterprise-guide/authenticating-with-saml.html#documentation-for-other-common-idps

[sso-def]: /glossary/sso.html
