***

## título: Configuración general

## Configuración general

Esta sección contiene la configuración de toda la instancia, como su URL, la zona horaria de informes y los conmutadores para deshabilitar o habilitar algunas de las funciones opcionales de Metabase.

Puede configurar estas opciones en el **General** sección de la **Configuración** en la ficha **Panel de administración**.

### Nombre del sitio

Cómo desea hacer referencia a esta instancia de Metabase.

### URL del sitio

La dirección URL base de esta instancia de metabase. La URL base se utiliza en los correos electrónicos para permitir a los usuarios hacer clic en su instancia específica. Asegúrese de incluir http:// o https:// para asegurarse de que sea accesible.

### Redirigir a HTTPS

Forzar a todo el tráfico a usar HTTPS a través de la redirección, si el sitio puede servir a través de HTTPS.

*Valor predeterminado: deshabilitado*.

Por ejemplo, si está sirviendo su aplicación Metabase en "example.com", y habilita la redirección HTTPS, cuando un usuario ingresa una dirección como "example.com/data" en la barra de direcciones de su navegador, el usuario será redirigido automáticamente a una conexión segura en "https://example.com/data".

> Nota: si no ha configurado HTTPS en su servidor, Metabase no le permitirá habilitar la redirección HTTPS. En su lugar, recibirá una advertencia que dice "Parece que HTTPS no está configurado correctamente".

### Dirección de correo electrónico para solicitudes de ayuda

Esta dirección de correo electrónico se mostrará en varios mensajes a lo largo de la metabase cuando los usuarios se encuentren con un escenario en el que necesiten ayuda de un administrador, como una solicitud de restablecimiento de contraseña.

### Zona horaria del informe

El **zona horaria del informe** establece la zona horaria predeterminada para mostrar las horas. La zona horaria se utiliza al desglosar los datos por fechas.

*Establecer la zona horaria predeterminada no cambiará la zona horaria de ningún dato de la base de datos*. Si las horas subyacentes en la base de datos no están asignadas a una zona horaria, Metabase usará la zona horaria del informe como zona horaria predeterminada.

### Seguimiento anónimo

Esta opción cambia determina si se permite o no [datos anónimos sobre su uso de Metabase](../information-collection.md) para ser devuelto a nosotros para ayudarnos a mejorar el producto. *Los datos de su base de datos nunca se rastrean ni se envían*.

### Habilitar radiografías

[Radiografías](../users-guide/14-x-rays.md) son una excelente manera de permitir a sus usuarios explorar rápidamente sus datos o partes interesantes de gráficos, o ver una comparación de diferentes cosas. Pero si se trata de fuentes de datos en las que permitir que los usuarios ejecuten radiografías en ellas incurriría en un rendimiento burdonante o costos monetarios, puede desactivarlas aquí.

### Consultas anidadas habilitadas

De forma predeterminada, Metabase permite a los usuarios utilizar una pregunta guardada previamente como fuente para consultas. Si tiene muchas consultas de ejecución lenta, es posible que desee desactivar esta opción, ya que puede producirse un problema de rendimiento.

### Nombres de tablas y campos descriptivos

De forma predeterminada, la metabase intenta hacer que los nombres de campos y tablas sean más legibles cambiando cosas como `somehorriblename` Para `Some Horrible Name`. Esto no funciona bien para otros idiomas que no sean el inglés, o para campos que tienen muchas abreviaturas o códigos en ellos. Si desea desactivar esta configuración, puede hacerlo desde el Panel de administración en Configuración > General > Nombres de tabla y campo descriptivos.

Para corregir manualmente los nombres de campos o tablas si siguen teniendo un aspecto incorrecto, puede ir a la sección Metadatos del Panel de administración, seleccionar la base de datos que contiene la tabla o el campo que desea editar, seleccionar la tabla y, a continuación, editar los nombres en los cuadros de entrada que aparecen.

***

## Siguiente: Dar formato a los datos

Personalice el idioma predeterminado de la metabase, así como la forma en que los números, las fechas, las horas y las monedas deben mostrarse en la metabase con [configuración de formato](19-formatting-settings.md).
