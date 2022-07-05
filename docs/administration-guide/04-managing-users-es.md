***

## título: Gestión de personas y grupos

# Gestión de personas y grupos

Para comenzar a administrar personas, primero vaya al **Panel de administración** haciendo clic en el botón **engranaje** en la parte inferior de la barra lateral de navegación y seleccionando **Configuración de administración**.

En el panel De administración, seleccione la opción **Gente** de la barra de menús en la parte superior de la pantalla. Verá una lista de todas las personas de su organización.

![Admin menu](images/AdminBar.png)

## Gestión de personas

### Creación de cuentas para tu equipo

Para agregar una nueva persona, haga clic en **Añadir persona** en la esquina superior derecha. Se te pedirá que introduzcas su nombre y dirección de correo electrónico.

Si ya lo has hecho [Metabase configurada para usar el correo electrónico](02-setting-up-email.md), Metabase enviará al nuevo usuario un correo electrónico de invitación. De lo contrario, le dará una contraseña temporal que tendrá que enviar a la persona a la que está invitando a mano.

### Desactivación de una cuenta

Para desactivar la cuenta de alguien, haga clic en el icono de tres puntos a la derecha de la fila de una persona y seleccione **Desactivar** del menú desplegable. La desactivación de una cuenta la marcará como inactiva y evitará que el usuario inicie sesión, pero *No* eliminar las preguntas o paneles guardados de esa persona.

![Remove a user](images/RemoveUser.png)

### Reactivación de una cuenta

Para reactivar una cuenta desactivada, haga clic en el botón **Desactivado** en la parte superior de la lista de personas para ver la lista de cuentas desactivadas. Haga clic en el icono en el extremo derecho para reactivar esa cuenta, lo que les permite iniciar sesión en Metabase nuevamente.

### Eliminación de una cuenta

La metabase no admite explícitamente la eliminación de cuentas. En su lugar, Metabase desactiva las cuentas para que las personas no puedan iniciar sesión en ellas, mientras conserva cualquier pregunta, modelo, panel y otros elementos creados por esas cuentas.

Si desea eliminar una cuenta porque la información de la cuenta se configuró incorrectamente, puede desactivar la cuenta anterior y crear una nueva en su lugar.

1.  Cambie el nombre y el correo electrónico asociados con la cuenta anterior.
2.  [Desactivar](#deactivating-an-account) la cuenta anterior.
3.  [Crear una nueva cuenta](#creating-accounts-for-your-team) con la información correcta de la persona.

### Editar una cuenta

Puede editar el nombre y la dirección de correo electrónico de alguien haciendo clic en el icono de tres puntos y eligiendo **Editar detalles**. Nota: tenga cuidado al cambiar la dirección de correo electrónico de alguien, porque *Esto cambiará la dirección que usarán para iniciar sesión en metabase*.

### Comprobar el método de autenticación de alguien

Busca a una persona y busca un icono junto a su nombre.

*   Si inician sesión con las credenciales de Google, Metabase muestra un icono de Google.
*   Si inician sesión con una dirección de correo electrónico y una contraseña almacenadas en la Metabase, no se muestra ningún icono.

Tenga en cuenta que el tipo de usuario se establece cuando se crea la cuenta por primera vez: si crea un usuario en metabase, pero esa persona inicia sesión a través de Google o alguna otra forma de [SSO](sso.md), el icono de este último *no* aparecen junto a su nombre.

### Restablecer la contraseña de alguien

Si ya lo has hecho [configuró la configuración de correo electrónico](02-setting-up-email.md), las personas pueden restablecer sus contraseñas utilizando el enlace "olvidé mi contraseña" en la pantalla de inicio de sesión. Si aún no ha configurado la configuración de su correo electrónico, verán un mensaje que les indicará que le pidan a un administrador que restablezca su contraseña por ellos.

Para restablecer una contraseña para alguien, simplemente haga clic en el icono de tres puntos junto a su cuenta y elija **Restablecer contraseña**. Si no lo has hecho [configuró la configuración de correo electrónico](02-setting-up-email.md) sin embargo, se le dará una contraseña temporal que tendrá que compartir con esa persona. De lo contrario, recibirán un correo electrónico de restablecimiento de contraseña.

### Restablecer la contraseña de administrador

Si utilizas Metabase Cloud, [póngase en contacto con el servicio de](https://www.metabase.com/help-premium/) para restablecer la contraseña de administrador.

Si eres administrador de la Metabase y tienes acceso a la consola del servidor, puedes hacer que la Metabase te envíe un token de restablecimiento de contraseña:

1.  Detenga la aplicación Metabase en ejecución.

2.  Reiniciar metabase con `reset-password email@example.com`, donde "email@example.com" es el correo electrónico asociado a la cuenta de administrador:
        java -jar metabase.jar reset-password email@example.com

3.  La metabase imprimirá un token aleatorio como este:

        ...
        Resetting password for email@example.com...

        OK [[[1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89]]]

4.  Iniciar metabase normalmente de nuevo (*sin* el `reset-password` opción).

5.  Navegue hasta él en su navegador utilizando la ruta `/auth/reset_password/:token`, donde ":token" es el token que se generó a partir del paso anterior. La URL completa debería tener un aspecto similar al siguiente:
        https://metabase.example.com/auth/reset_password/1_7db2b600-d538-4aeb-b4f7-0cf5b1970d89

6.  Ahora debería ver una página donde puede ingresar una nueva contraseña para la cuenta de administrador.

### Darse de baja de todas las suscripciones / alertas

Esta acción eliminará cualquier suscripción o alerta de panel que la persona haya creado y las eliminará como destinatario de cualquier otra suscripción o alerta.

Esta acción no afecta a las listas de distribución de correo electrónico que se administran fuera de la metabase.

## Grupos

Para determinar [quién tiene acceso a qué](05-setting-permissions.md), tendrás que

*   Cree uno o más grupos.
*   Elija qué nivel de acceso tiene ese grupo a diferentes bases de datos, colecciones, etc.
*   Luego agregue personas a esos grupos.
*   (Opcional) promover a las personas a [gerentes de grupo](#group-managers).

Para ver y administrar sus grupos, vaya al **Panel de administración** > **Gente** y luego haga clic en **Grupos** desde el menú lateral.

![Groups](images/groups.png)

### Grupos predeterminados especiales

Cada metabase tiene dos grupos predeterminados: administradores y todos los usuarios. Estos son grupos especiales que no se pueden eliminar.

#### Administradores

Para convertir a alguien en administrador de Metabase, solo necesita agregarlo al grupo Administradores. Los administradores de la metabase pueden iniciar sesión en el panel de administración y realizar cambios allí, y siempre tienen acceso sin restricciones a todos los datos que tiene en la instancia de la metabase. ¡Así que tenga cuidado de a quién agrega al grupo Administrador!

#### Todos los usuarios

El **Todos los usuarios** el grupo es otro especial. Cada usuario de Metabase es siempre miembro de este grupo, aunque también puede ser miembro de tantos otros grupos como desee. Recomendamos utilizar el grupo Todos los usuarios como una forma de establecer los niveles de acceso predeterminados para los nuevos usuarios de la metabase. Si tiene [Inicio de sesión único de Google](10-single-sign-on.md) habilitado, los nuevos usuarios que se unan de esa manera se agregarán automáticamente al grupo Todos los usuarios.

Es importante que su grupo Todos los usuarios nunca tenga *mayor* acceso para un elemento que para un grupo para el que está intentando restringir el acceso; de lo contrario, la configuración más permisiva ganará. Ver [Configuración de permisos](05-setting-permissions.md).

### Administración de grupos

#### Crear un grupo y agregar personas a él

Para crear un grupo, vaya a **Configuración de administración** > **Gente** > **Grupos**y haga clic en el icono **Agregar un grupo** botón.

Recomendamos crear grupos que correspondan a los equipos que tiene su empresa u organización, como Recursos Humanos, Ingeniería, Finanzas, etc. De forma predeterminada, los grupos recién creados no tienen acceso a nada.

Haga clic en un grupo y, a continuación, haga clic en `Add members` para agregar personas a ese grupo. Haga clic en la X en el lado derecho de un miembro del grupo para eliminarlos de ese grupo. También puede agregar o quitar personas de grupos de la lista Personas mediante el menú desplegable de la columna Grupos.

#### Eliminación de un grupo

Para eliminar un grupo, haga clic en el icono X a la derecha de un grupo de la lista para eliminarlo (recuerde, no puede quitar los grupos predeterminados especiales).

#### Agregar personas a grupos

Agregar personas a grupos le permite asignar

*   [Acceso a datos](05-setting-permissions.md),
*   [Permisos de recopilación](06-collections.md),
*   [Permisos de aplicación](application-permissions.md).

Para agregar a alguien a uno o más grupos, simplemente haga clic en el menú desplegable Grupos y haga clic en las casillas de verificación junto a los grupos a los que desea agregar a la persona. También puedes agregar personas desde la página del grupo.

### Gerentes de grupo

{% include plans-blockquote.html feature="Group managers" %}

**Gerentes de grupo** puede administrar a otras personas dentro de su grupo.

Los gerentes de grupo pueden:

*   Agregar o eliminar personas de su grupo (es decir, personas que ya tienen cuentas en su Metabase).
*   Ver todas las personas en el **Configuración de administración** > **Gente** pestaña.
*   Promueva a otras personas a administrador de grupo o degradarlos de administrador de grupo a miembro.
*   Cambie el nombre de su grupo.

Los gerentes de grupo no son administradores, por lo que sus poderes son limitados. No pueden crear nuevos grupos ni invitar a nuevas personas a su Metabase.

#### Promoción/degradación de gerentes de grupo

Para promover a alguien para que se convierta en gerente de grupo:

1.  Haga clic en el botón **Engranaje** en la parte inferior de la barra lateral de navegación.
2.  Vete a **Configuración de administración** > **Gente** > **Grupos**.
3.  Seleccione el grupo que desea que administre la persona. Si la persona aún no está en el grupo, deberá agregarla al grupo.
4.  Busca a la persona que quieres promocionar, coloca el cursor sobre su tipo de miembro y haz clic en la flecha hacia arriba para promocionarla a administradora de grupos. Si desea degradarlos, haga clic en la flecha hacia abajo.

### Estrategias de agrupación

Para obtener orientación sobre los grupos que debe crear para su Metabase, consulte [Estrategias de permisos](https://www.metabase.com/learn/permissions/strategy).

## Lecturas adicionales

*   [Configurar el inicio de sesión único](10-single-sign-on.md).
*   [Información general sobre permisos](05-setting-permissions.md)
*   [Permisos de aprendizaje](https://www.metabase.com/learn/permissions/)
