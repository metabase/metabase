***

## título: Configuración del correo electrónico

# Configuración del correo electrónico

Una vez que conecte su base de datos a la Metabase, querrá configurar una cuenta de correo electrónico para enviar notificaciones del sistema a los usuarios de su organización.  La metabase utiliza el correo electrónico para restablecer contraseñas, incorporar nuevos usuarios y notificarle cuando algo sucede.

*   [Configuración de la cuenta de correo electrónico](#configuring-your-email-account)
    *   [Aplicaciones de Google](#google-apps)
    *   [Amazon SES](#amazon-ses)
    *   [Mandril](#mandrill)
*   [Configuración recomendada](#recommended-settings)

## Configuración de la cuenta de correo electrónico

Para que Metabase envíe mensajes a los usuarios de su organización, deberá configurar una cuenta de correo electrónico para enviar correos electrónicos a través de *SMTP* (protocolo simple de transferencia de correo), que es un estándar de correo electrónico que protege los correos electrónicos con protección de seguridad SSL.

Para comenzar, vaya al Panel de administración desde el menú desplegable en la parte superior derecha de la Metabase, luego desde la página Configuración, haga clic en **Correo electrónico** en el menú de la izquierda.

Debería ver este formulario:

![Email Credentials](images/EmailCredentials.png)

### Aplicaciones de Google

1.  En **Host SMTP** , introduzca smtp.gmail.com
2.  Rellene 465 para el **Puerto SMTP** campo
3.  Para el **Seguridad SMTP** , entrar **SSL**
4.  En **Nombre de usuario SMTP** , introduce tu dirección de correo electrónico de Google Apps (por ejemplo, hello@yourdomain.com)
5.  Introduce tu contraseña de Google Apps en el cuadro **Contraseña SMTP** campo
6.  Ingrese la dirección de correo electrónico que desea que se utilice como remitente de las notificaciones del sistema en el \**Desde la dirección* campo.

### Amazon SES

1.  Inicie sesión en <https://console.aws.amazon.com/ses>.
2.  Clic **Configuración de SMTP** desde el panel de navegación.
3.  Escoger **Crear mis credenciales SMTP** en el panel de contenido.
4.  Crear un usuario en el **Crear usuario para SMTP** y, a continuación, haga clic en **Crear**.
5.  A continuación, seleccione **Mostrar credenciales SMTP de usuario** para ver las credenciales SMTP del usuario.
6.  Vuelva al formulario panel de administración de la metabase e introduzca la información allí.

**Nota**

Compruebe si [cuotas de correo electrónico](https://docs.aws.amazon.com/ses/latest/dg/quotas.html) aplicar a su servidor de Amazon SES. Es posible que desee administrar sus destinatarios de correo electrónico utilizando grupos en su lugar.

### Mandril

1.  Inicie sesión en su cuenta de Mandrill y localice sus credenciales desde el **Información de SMTP y API** página allí.
2.  Su contraseña SMTP es cualquier clave de API activa para su cuenta — *no* su contraseña de Mandrill.
3.  Aunque Mandrill enumera **puerto 587**, [cualquier puerto compatible con Mandrill](https://mandrill.zendesk.com/hc/en-us/articles/205582167-What-SMTP-ports-can-I-use-) funcionará para el correo electrónico SMTP.
4.  Ahora puede volver al formulario del Panel de administración de metabase e ingresar la información allí.

## Configuración recomendada

*   SSL es muy recomendable porque es más seguro y le da a su cuenta protección adicional contra amenazas.
*   Si su servicio de correo electrónico tiene una lista blanca de direcciones de correo electrónico que pueden enviar correo electrónico, asegúrese de incluir en la lista blanca la dirección de correo electrónico que puso en el cuadro **Desde la dirección** para garantizar que usted y sus compañeros de equipo reciban todos los correos electrónicos de Metabase.

***

## Siguiente: configurar Slack

Si desea utilizar Slack para mejorar la experiencia de la metabase, hagámoslo ahora. Aprendamos [Cómo configurar Slack](09-setting-up-slack.md).
