***

## título: SSH tunneling in Metabase

## Túnel SSH en Metabase

La metabase puede conectarse a algunas bases de datos estableciendo primero una conexión con un servidor entre la metabase y un almacén de datos, y luego conectándose al almacén de datos utilizando esa conexión como puente. Esto hace posible la conexión a algunos almacenes de datos en situaciones que de otro modo impedirían el uso de Metabase.

*   [Cuándo usar la tunelización SSH](#when-to-use-ssh-tunneling)
*   [Cómo usar el túnel SSH](#how-to-use-ssh-tunneling)
*   [Desventajas de las conexiones indirectas](#disadvantages-of-indirect-connections)
*   [Ejecutar SSH directamente](#running-ssh-directly)

### Cuándo usar la tunelización SSH

En general, prefiera una red privada virtual (VPN) a un túnel SSH, pero hay dos casos de uso básicos para un túnel SSH:

*   Cuando una conexión directa es imposible.
*   Cuando una conexión directa está prohibida debido a una política de seguridad.

A veces, cuando un almacén de datos se encuentra dentro de un entorno empresarial, las conexiones directas son bloqueadas por dispositivos de seguridad como firewalls y sistemas de prevención de intrusiones. Para otorgar acceso a este entorno, muchas empresas ofrecen una VPN, un host bastión o ambos. Las VPN son la opción más conveniente y confiable, aunque los hosts bastión se utilizan con frecuencia, especialmente con proveedores de nube como Amazon Web Services, donde las VPC (Virtual Private Clouds) prohíben las conexiones directas. Los hosts Bastion ofrecen la opción de conectarse primero a una computadora en el borde de la red protegida, luego desde esa computadora host bastión establecer una segunda conexión al almacén de datos en la red interna, esencialmente parcheando estas dos conexiones juntas. Utilizando la función de túnel SSH, Metabase puede automatizar este proceso.

### Cómo usar el túnel SSH

Al conectarse a través de un host bastión:

*   Responda afirmativamente al parámetro "Usar un túnel SSH para conexiones de base de datos".
*   Introduzca el nombre de host para el almacén de datos tal como se ve desde dentro de la red en el `Host` parámetro.
*   Introduzca el puerto de almacenamiento de datos visto desde dentro de la red en el `Port` parámetro.
*   Introduzca el nombre externo del host bastión visto desde el exterior de la red (o donde quiera que se encuentre) en el `SSH tunnel host` parámetro.
*   Ingrese el puerto SSH visto desde fuera de la red en el `SSH tunnel port` parámetro. Por lo general, esto es 22, independientemente del almacén de datos al que se esté conectando.
*   Ingrese el nombre de usuario y la contraseña que utiliza para iniciar sesión en el host bastión en el `SSH tunnel username` y `SSH tunnel password` Parámetros.

Si no puede conectarse, pruebe sus credenciales SSH conectándose al servidor SSH/Bastion Host utilizando ssh directamente:

    ssh <SSH tunnel username>@<SSH tunnel host> -p <SSH tunnel port>

Otro caso común en el que las conexiones directas son imposibles es cuando se conecta a un almacén de datos que solo es accesible localmente y no permite conexiones remotas. En este caso, abrirá una conexión SSH al almacén de datos, luego desde allí se conectará de nuevo a la misma computadora.

*   Responda afirmativamente al parámetro "Usar un túnel SSH para conexiones de base de datos".
*   Entrar `localhost` En `Host` parámetro. Este es el nombre del servidor.
*   Introduzca el mismo valor en el cuadro `Port` que usaría si estuviera sentado directamente en el sistema host del almacén de datos.
*   Introduzca el nombre extenal del almacén de datos, tal como se ve desde el exterior de la red (o donde quiera que se encuentre) en el `SSH tunnel host` parámetro.
*   Ingrese el puerto SSH visto desde fuera de la red en el `SSH tunnel port` parámetro. Por lo general, esto es 22, independientemente del almacén de datos al que se esté conectando.
*   Ingrese el nombre de usuario y la contraseña que utiliza para iniciar sesión en el host bastión en el `SSH tunnel username` y `SSH tunnel password` Parámetros.

Si tiene problemas para conectarse, verifique el puerto de host SSH y la contraseña conectándose manualmente mediante ssh o PuTTY en sistemas Windows más antiguos.

### Desventajas de las conexiones indirectas

Si bien el uso de un túnel SSH permite utilizar un almacén de datos que de otro modo sería inaccesible, casi siempre es preferible utilizar una conexión directa cuando sea posible.

Hay varias limitaciones inherentes a la conexión a través de un túnel:

*   Si la conexión SSH adjunta se cierra porque pone su computadora en reposo o cambia de red, todas las conexiones establecidas también se cerrarán. Esto puede causar retrasos en la reanudación de las conexiones después de suspender su computadora portátil.
*   Casi siempre es más lento. La conexión tiene que pasar por un ordenador adicional.
*   La apertura de nuevas conexiones SSH lleva más tiempo.
*   Múltiples operaciones sobre el mismo túnel SSH pueden bloquearse entre sí. Esto puede aumentar la latencia.
*   El número de conexiones a través de un host bastión a menudo está limitado por la política de la organización.
*   Algunas organizaciones tienen políticas de seguridad de TI que prohíben el uso de túneles SSH para eludir los perímetros de seguridad.

### Ejecutar SSH directamente

La función de túnel SSH en Metabase existe como un envoltorio conveniente alrededor de SSH, y automatiza los casos comunes de conexión a través de un túnel. También hace posible las conexiones con sistemas que no dan acceso al shell. La metabase utiliza un cliente SSH integrado que no depende del cliente SSH del sistema instalado. Esto permite conexiones desde sistemas en los que no se puede ejecutar SSH manualmente. También significa que metabase no puede aprovechar los servicios de autenticación proporcionados por el sistema, como la autenticación de dominio de Windows o la autenticación Kerberos.

Si necesita conectarse mediante un método no habilitado por Metabase, a menudo puede lograrlo ejecutando SSH directamente:

    ssh -Nf -L input-port:internal-server-name:port-on-server username@bastion-host.domain.com

Esto le permite utilizar la gama completa de características incluidas en SSH. Si se encuentra haciendo esto a menudo, háganoslo saber para que podamos ver cómo hacer que su proceso sea más conveniente a través de Metabase.

### Lecturas adicionales

Para obtener más información sobre cómo conectar una base de datos a la metabase, consulte [Agregar y administrar bases de datos](01-managing-databases.md).
