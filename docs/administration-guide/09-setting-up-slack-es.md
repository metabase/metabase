***

## título: Configuración de Slack

# Configuración de Slack

Si quieres tener tu [Suscripciones de panel][dashboard-subscriptions] Enviado a canales de Slack (o personas en Slack), un administrador primero debe integrar tu Metabase con Slack.

Aquí hay una descripción general de los pasos para configurar Slack:

1.  [Crea tu aplicación de Slack](#create-your-slack-app)
2.  [Instalar la aplicación en el área de trabajo](#install-your-app-to-your-workspace)
3.  [Obtener el token OAuth de usuario de bot](#the-bot-user-oauth-token)
4.  [Crea un canal de metabase dedicado en tu Slack](#create-a-dedicated-metabase-channel-in-your-slack)
5.  [Guardar los cambios](#save-your-changes-in-metabase)

## Crea tu aplicación de Slack

Para que metabase publique en tus canales de Slack, deberás crear una aplicación de Slack y ponerla a disposición de metabase.

Desde cualquier página de la metabase, vaya a **Configuración de administración** > **Configuración** > **Flojo**.

Haga clic en **Abrir aplicaciones de Slack**. Metabase abrirá una nueva pestaña del navegador y te enviará al sitio web de Slack para crear la aplicación Slack.

En el sitio web de Slack, haz clic en **Crear una aplicación**.

### Elegir un área de trabajo para desarrollar la aplicación

Seleccione el área de trabajo que desea crear la aplicación.

### El manifiesto de la aplicación

Al hacer clic en **Abre la aplicación Slack**, Metabase pasará el manifiesto de la aplicación, que Slack usará para configurar la aplicación.

Es posible que reciba una advertencia que diga:

**Esta aplicación se crea a partir de un manifiesto de 3rd party** Siempre verifique las URL y los permisos a continuación.

Esta advertencia es esperada (Metabase es el tercero aquí). Puede hacer clic en **Configurar** para ver el manifiesto de la aplicación Metabase enviado en la URL. Aquí está el manifiesto en formato YAML:

    _metadata:
      major_version: 1
      minor_version: 1
    display_information:
      name: Metabase
      description: Bringing the power of Metabase to your Slack #channels!
      background_color: "#509EE3"
    features:
      bot_user:
        display_name: Metabase
    oauth_config:
      scopes:
        bot:
          - users:read
          - channels:read
          - channels:join
          - files:write
          - chat:write
          - chat:write.customize
          - chat:write.public

El manifiesto solo se encarga de algunas configuraciones de su aplicación y ayuda a acelerar las cosas.

Haga clic en el botón **Próximo** botón. Luego presiona **Crear** para configurar tu aplicación de Slack.

## Instalar la aplicación en el área de trabajo

En el sitio de Slack de tu aplicación recién creada, en el **Configuración** > **Información básica** , en **Instalar la aplicación**, haga clic en **Instalar en el espacio de trabajo**. En la siguiente pantalla, haga clic en **Conceder** para dar acceso a la metabase a tu espacio de trabajo de Slack.

## El token OAuth del usuario del bot

En la página del sitio de Slack para tu aplicación de Slack, a la izquierda en el **Funciones** , haga clic en **OAuth y permisos** en la barra lateral Aplicaciones de Slack y, a continuación, copie el icono **Token de OAuth de usuario de bot**. Vuelve a la página de configuración de Slack de tu Metabase y pega este token en el campo Metabase con el mismo nombre.

## Crea un canal de metabase dedicado en tu Slack

En tu espacio de trabajo de Slack, crea un canal público con el nombre que quieras (creemos que algo como "metabase" funciona bien) y luego ingresa el nombre de ese canal en el **Nombre del canal de Slack** en metabase. Este canal permite que tu Metabase publique en tu espacio de trabajo de Slack sin tener que lidiar con permisos innecesarios. Asegúrese de que el canal que cree sea el mismo canal que ingresó en este campo en metabase (omita el prefijo "#").

## Guardar los cambios en la metabase

En Metabase, haga clic en el botón **Guardar cambios** botón y eso es todo! Metabase ejecutará automáticamente una prueba rápida para comprobar que el token de API y tu canal dedicado de Slack funcionan correctamente. Si algo sale mal, te dará un mensaje de error.

***

## Siguiente: configurar la metabase

Hay algunas otras opciones que se configuran en Metabase. [Aprende cómo](08-configuration-settings).

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.html
