***

## título: Autenticación con inicio de sesión de Google o LDAP

# Autenticación con el inicio de sesión de Google o LDAP

Habilitante [Inicio de sesión de Google](#enabling-google-sign-in) o [LDAP](#enabling-ldap-authentication) para [inicio de sesión único (SSO)][sso-docs] permite que su equipo inicie sesión con un clic en lugar de usar el correo electrónico y la contraseña. También se puede utilizar para permitir que las personas se registren en cuentas de Metabase sin que un administrador tenga que crearlas primero. Puede encontrar estas opciones en el **Configuración** sección de la **Panel de administración**debajo **Autenticación**.

Si desea que las personas se autentiquen con [SAML][saml-docs] o [JWT][jwt-docs], Metabase [planes pagados](https://www.metabase.com/pricing) déjate hacer precisamente eso.

A medida que pasa el tiempo, podemos agregar otros proveedores de autenticación. Si tiene un servicio que le gustaría que funcionara con Metabase, háganoslo saber mediante [presentar un problema](http://github.com/metabase/metabase/issues/new).

*   [Habilitación del inicio de sesión de Google](#enabling-google-sign-in)
    *   [Trabajar en la consola para desarrolladores de Google](#working-in-the-google-developer-console)
    *   [Creación de cuentas de metabase con el inicio de sesión de Google](#creating-metabase-accounts-with-google-sign-in)
*   [Habilitación de la autenticación LDAP](#enabling-ldap-authentication)
    *   [Esquema de usuario LDAP](#ldap-user-schema)
    *   [Asignación de grupos LDAP](#ldap-group-mapping)
    *   [Filtro de pertenencia a grupos LDAP](#ldap-group-membership-filter)
*   [Sincronización de atributos de usuario al iniciar sesión](#syncing-user-attributes-at-login)
    *   [Sincronización de atributos de usuario con Google](#syncing-user-attributes-with-google)
    *   [Sincronización de atributos de usuario con LDAP](#syncing-user-attributes-with-ldap)
*   [Cambiar el método de inicio de sesión de una cuenta de correo electrónico a SSO](#changing-an-accounts-login-method-from-email-to-sso)
*   [Comprobación de si el inicio de sesión único funciona correctamente](#checking-if-sso-is-working-correctly)

## Habilitación del inicio de sesión de Google

### Trabajar en la consola para desarrolladores de Google

Para que tu equipo comience a iniciar sesión con Google, primero tendrás que crear una aplicación a través de Google. [consola del desarrollador](https://console.developers.google.com/projectselector2/apis/library).

A continuación, deberá crear credenciales de autorización para su aplicación siguiendo [las instrucciones de Google aquí](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid). Especifique el URI de la instancia de metabase en la sección "Orígenes de JavaScript autorizados". Debe dejar en blanco la sección "URI de redireccionamiento autorizados".

Una vez que tenga su `Client ID` (terminando en `.apps.googleusercontent.com`), haga clic en `Configure` en la sección "Iniciar sesión con Google" de la página Autenticación del Panel de administración de la metabase. Pega tu `client_id` en la primera caja.

Ahora los usuarios existentes de Metabase que han iniciado sesión en una cuenta de Google que coincida con el correo electrónico de su cuenta de Metabase pueden iniciar sesión con solo un clic.

### Creación de cuentas de metabase con el inicio de sesión de Google

Si has añadido tu ID de cliente de Google a la configuración de la metabase, también puedes permitir que los usuarios se registren por su cuenta sin crear cuentas para ellos.

Para habilitarlo, ve a la página de configuración de inicio de sesión de Google y especifica el dominio de correo electrónico que quieres permitir. Por ejemplo, si trabaja en WidgetCo, puede ingresar "widgetco.com" en el campo para permitir que cualquier persona con un correo electrónico de la empresa se registre por su cuenta.

Ten en cuenta que las cuentas de Metabase creadas con el inicio de sesión de Google no tienen contraseñas y deben usar Google para iniciar sesión en metabase.

## Habilitación de la autenticación LDAP

En **Admin** > **Autenticación** , vaya a la sección LDAP y haga clic en **Configurar**. Haga clic en el interruptor en la parte superior del formulario para habilitar LDAP y, a continuación, rellene el formulario con la siguiente información sobre su servidor LDAP:

*   nombre de host
*   puerto
*   configuración de seguridad
*   Nombre de usuario de administrador LDAP
*   Contraseña de administrador LDAP

A continuación, guarde los cambios.

La metabase extraerá tres atributos principales de su directorio LDAP:

*   correo electrónico (de forma predeterminada a la opción `mail` atributo)
*   nombre (por defecto es el `givenName` atributo)
*   apellido (por defecto a la opción `sn` atributo).

Si la configuración de LDAP utiliza otros atributos para estos, puede editarlo en la parte "Atributos" del formulario.

![Attributes](./images/ldap-attributes.png)

Su directorio LDAP debe tener el campo de correo electrónico rellenado para cada entrada que se convertirá en un usuario de Metabase, de lo contrario Metabase no podrá crear la cuenta, ni esa persona podrá iniciar sesión. Si falta alguno de los campos de nombre, metabase usará un valor predeterminado de "Desconocido", y la persona puede cambiar su nombre en su [configuración de la cuenta](../users-guide/account-settings.html).

### Esquema de usuario LDAP

El **Esquema de usuario** en esta misma página es donde puede ajustar la configuración relacionada con dónde y cómo metabase se conecta a su servidor LDAP para autenticar a los usuarios.

El **Base de búsqueda de usuarios** el campo debe completarse con el *nombre distinguido* (DN) de la entrada en el servidor LDAP que es el punto de partida al buscar usuarios.

Por ejemplo, supongamos que está configurando LDAP para su empresa, WidgetCo, donde está su DN base `dc=widgetco,dc=com`. Si todas las entradas de los empleados se almacenan dentro de una unidad organizativa en el servidor LDAP denominada `People`, querrá proporcionar el campo base de búsqueda de usuario con el DN `ou=People,dc=widgetco,dc=com`. Esto indica a Metabase que comience a buscar entradas coincidentes en esa ubicación dentro del servidor LDAP.

Verá el siguiente valor predeterminado atenuado en el **Filtro de usuario** campo:

    (&(objectClass=inetOrgPerson)(|(uid={login})(mail={login})))

Cuando una persona inicia sesión en la metabase, este comando confirma que el inicio de sesión que proporcionó coincide con un UID *o* campo de correo electrónico en su servidor LDAP, *y* que la entrada coincidente tiene un objetoClass de `inetOrgPerson`.

Este comando predeterminado funcionará para la mayoría de los servidores LDAP, ya que `inetOrgPerson` es una objectClass ampliamente adoptada. Pero si su empresa, por ejemplo, utiliza una objectClass diferente para categorizar a los empleados, este campo es donde puede establecer un comando diferente sobre cómo Metabase encuentra y autentica una entrada LDAP cuando una persona inicia sesión.

### Asignación de grupos LDAP

Asignación manual de personas a [grupos](04-managing-users.html#groups) en metabase después de haber iniciado sesión a través de SSO puede ser tedioso. En su lugar, puede aprovechar los grupos que ya existen en su directorio LDAP habilitando [asignaciones de grupo](/learn/permissions/ldap-auth-access-control.html#group-management).

Desplazarse hasta **Esquema de grupo** en la misma página de configuración de LDAP y haga clic en el interruptor para habilitar la asignación de grupos. Seleccionar **Editar asignación** abrirá un modal donde puede crear y editar asignaciones, especificando qué grupo LDAP corresponde a qué grupo de metabase.

Como puedes ver a continuación, si tienes un **Contabilidad** tanto en el servidor LDAP como en la instancia de la metabase, solo tendrá que proporcionar el nombre distintivo del servidor LDAP (en el ejemplo, es `cn=Accounting,ou=Groups,dc=widgetco,dc=com`) y seleccione su coincidencia en el menú desplegable de sus grupos de metabase existentes.

![Group Mapping](images/ldap-group-mapping.png)

#### Notas sobre la asignación de grupos

*   El grupo Administrador funciona como cualquier otro grupo.
*   Las actualizaciones de la pertenencia a grupos de una persona basadas en asignaciones LDAP no son instantáneas; los cambios solo entrarán en vigor después de que las personas vuelvan a iniciar sesión.
*   Las personas solo se agregan o eliminan de los grupos mapeados; la sincronización no tiene ningún efecto en los grupos de la metabase que no tienen una asignación LDAP.

### Filtro de pertenencia a grupos LDAP

{% include plans-blockquote.html feature="LDAP advanced features" %}

Filtro de búsqueda de pertenencia a grupos. Los marcadores de posición {dn} y {uid} se reemplazarán por el nombre distinguido y el UID del usuario, respectivamente.

## Lecturas adicionales

*   [Uso de LDAP para la autenticación y el control de acceso](/learn/permissions/ldap-auth-access-control.html)
*   [Guía de solución de problemas de LDAP](../troubleshooting-guide/ldap.html)
*   [Información general sobre permisos](05-setting-permissions.html)

## Sincronización de atributos de usuario al iniciar sesión

{% include plans-blockquote.html feature="Advanced authentication features" %}

### Sincronización de atributos de usuario con LDAP

Puedes gestionar [atributos de usuario][user-attributes-def] como nombres, correos electrónicos y roles de su directorio LDAP. Al configurar [espacio aislado de datos][data-sandboxing-docs], su directorio LDAP podrá [Pasar estos atributos][user-attributes-docs] a metabase.

### Sincronización de atributos de usuario con Google

Los atributos de usuario no se pueden sincronizar con el inicio de sesión normal de Google. Tendrás que configurar [Google SAML][google-saml-docs] o [JWT][jwt-docs] en lugar de.

## Cambiar el método de inicio de sesión de una cuenta de correo electrónico a SSO

Una vez que una persona crea una cuenta, no puede cambiar el método de autenticación para esa cuenta. Sin embargo, usted puede:

*   Desactivar la autenticación de contraseña para todos los usuarios desde **Configuración de administración** > **Autenticación**. Tendrás que pedir a las personas que inicien sesión con Google (si aún no lo han hecho).
*   Actualice manualmente el método de inicio de sesión de la cuenta en la base de datos de la aplicación Metabase. Esta opción no se recomienda a menos que esté familiarizado con la realización de cambios en la base de datos de la aplicación.

Tenga en cuenta que debe tener al menos una cuenta con inicio de sesión por correo electrónico y contraseña. Esta cuenta le protege de quedar bloqueado de su Metabase si hay algún problema con su proveedor de SSO.

## Solución de problemas de inicio de sesión

Para problemas comunes, vaya a [Solución de problemas de inicios de sesión](../troubleshooting-guide/cant-log-in.html).

[data-sandboxing-docs]: ../enterprise-guide/data-sandboxes.html

[google-saml-docs]: ../enterprise-guide/saml-google.html

[jwt-docs]: ../enterprise-guide/authenticating-with-jwt.html

[saml-docs]: ../enterprise-guide/authenticating-with-saml.html

[sso-docs]: ../administration-guide/sso.html

[user-attributes-docs]: ../enterprise-guide/data-sandboxes.html#getting-user-attributes

[user-attributes-def]: /glossary/attribute#user-attributes-in-metabase
