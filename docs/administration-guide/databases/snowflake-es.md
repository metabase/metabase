***

## título: Copo de nieve

# Copo de nieve

## Esquemas

Aquí puede especificar qué esquemas desea sincronizar y escanear. Las opciones son:

*   Todo
*   Sólo estos...
*   Todos excepto...

Para el **Sólo estos** y **Todos excepto** puede introducir una lista de valores separados por comas para indicar a la metabase qué esquemas desea incluir (o excluir). Por ejemplo:

    foo,bar,baz

Puede utilizar el `*` comodín para que coincida con varios esquemas.

Digamos que tienes tres esquemas: foo, bar y baz.

*   Si tiene **Sólo estos...** set, e introduzca la cadena `b*`, sincronizarás con bar y baz.
*   Si tiene **Todos excepto...** set, e introduzca la cadena `b*`, solo sincronizarás foo.

Tenga en cuenta que sólo el `*` se admite comodín; no puede usar otros caracteres especiales o regexes.

## Gotchas de copo de nieve

Aquí hay algunas gotchas a tener en cuenta al conectarse a Snowflake:

*   **Cuenta**. El `Account` el campo requiere el ID de cuenta alfanumérico *con* la región en la que se ejecuta el clúster de Snowflake. Por ejemplo, si está ejecutando Snowflake en AWS y la URL de su cuenta es `https://az12345.ca-central-1.snowflakecomputing.com`, a continuación, el `Account` Sería `az12345.ca-central-1.aws` (nótese el `.aws` sufijo). Hay algunas regiones que no necesitan este sufijo, así que por favor [consulte la documentación oficial de Snowflake](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html#locator-formats-by-cloud-platform-and-region) para ello

*   **El `Role` y `Schema` los campos son opcionales**. La especificación de un rol anulará el rol predeterminado del usuario de la base de datos. Por ejemplo, si el usuario de la base de datos es `REPORTER` con rol predeterminado `REPORTER`, pero el usuario también tiene acceso al rol `REPORTERPRODUCT`, y a continuación rellenando `REPORTERPRODUCT` En `Role` el campo garantizará que el `REPORTERPRODUCT` El rol se usa en lugar del predeterminado del usuario `REPORTER` rol. Si no se pasa ningún esquema, todos los esquemas disponibles para ese usuario y rol se mostrarán como carpetas en la interfaz de usuario de la metabase.

*   **Todos los demás campos deben introducirse en mayúsculas**. Excluyendo la contraseña.
