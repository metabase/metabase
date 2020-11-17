# Customizing the Metabase Jetty webserver

In most cases there will be no reason to modify any of the settings around how Metabase runs its embedded Jetty webserver to host the application, but if you wish to run HTTPS directly with your Metabase server or if you need to run on another port, that's all configurable.

### Running Metabase on another port

By default Metabase will launch on port 3000, but if you prefer to run the application on another port you can do so by setting the following environment variable:

    export MB_JETTY_PORT=12345
    java -jar metabase.jar

In this example once the application starts up you will access it on port `12345` instead of the default port of 3000.


### Listening on a specific network interface

By default, Metabase will be listening on `localhost`.  In some production environments you may want to listen on a different interface, which can be done by using the `MB_JETTY_HOST` environment variable:

    export MB_JETTY_HOST=0.0.0.0
    java -jar metabase.jar


### Using HTTPS with Metabase

If you have an SSL certificate and would prefer to have Metabase run over HTTPS directly using its webserver you can do so by using the following environment variables:

    export MB_JETTY_SSL="true"
    export MB_JETTY_SSL_PORT="8443"
    export MB_JETTY_SSL_KEYSTORE="path/to/keystore.jks" # replace these values with your own
    export MB_JETTY_SSL_KEYSTORE_PASSWORD="storepass"
    java -jar metabase.jar
    
Be sure to replace `path/to/keystore.jks` and `storepass` with the correct path to and password for your [Java KeyStore](https://www.digitalocean.com/community/tutorials/java-keytool-essentials-working-with-java-keystores). With the above settings applied you will be running Metabase on port 8443 over HTTPS using the supplied certificate.

No idea how to generate a Java KeyStore yourself? This is sort of an advanced topic, but if you're feeling froggy you can read more about how to configure SSL in Jetty [here](https://www.eclipse.org/jetty/documentation/current/configuring-ssl.html). Otherwise, you'll probably find it easiest to handle SSL termination outside of Metabase, for example by the Elastic Load Balancer if deploying via Elastic Beanstalk.