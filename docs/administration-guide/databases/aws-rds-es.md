***

## título: "Conexión al servicio de base de datos relacional (RDS) de AWS"

# Conexión al servicio de base de datos relacional (RDS) de AWS

RDS ofrece varias bases de datos que Metabase admite oficialmente, incluyendo PostgreSQL, MySQL, MariaDB, Oracle y SQL Server.

A continuación, le indicamos cómo obtener información de conexión para bases de datos en RDS de Amazon:

1.  Vaya a la consola de administración de AWS.
    *   ¿Necesita ayuda para encontrar eso? Visitar [https://**My_AWS_Account_ID**.signin.aws.amazon.com/console](https://\*\*My_AWS_Account_ID\*\*.signin.aws.amazon.com/console). Sin embargo, asegúrese de insertar su propio ID de cuenta de AWS.
2.  Debajo **Base de datos** servicios, haga clic en **RDS**.
3.  A continuación, haga clic en **Instancias**.
4.  Seleccione la base de datos que desea conectar a la metabase.
5.  Obtenga la información que necesitará para conectar Metabase a su RDS:
    *   **Nombre de host**. Esto aparece como el parámetro Endpoint.
    *   **Puerto**. Busque el parámetro de puerto en Seguridad y red.
    *   **Nombre de usuario**. Encuentre esto en Detalles de configuración.
    *   **Nombre de la base de datos**. Encuentre esto en Detalles de configuración.
    *   **Contraseña**. Solicite la contraseña al administrador de la base de datos.
