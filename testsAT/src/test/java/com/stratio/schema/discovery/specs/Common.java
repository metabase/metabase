/*
 * © 2017 Stratio Big Data Inc., Sucursal en España. All rights reserved
 *
 * This software is a modification of the original software mesosphere/dcos-kafka-service licensed under the
 * Apache 2.0 license, a copy of which is included in root folder. This software contains proprietary information of
 * Stratio Big Data Inc., Sucursal en España and may not be revealed, sold, transferred, modified, distributed or
 * otherwise made available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or
 * decompiled, without express written authorization from Stratio Big Data Inc., Sucursal en España.
 */
package com.stratio.schema.discovery.specs;

import com.stratio.qa.specs.CommonG;
import java.net.Socket;
import java.nio.channels.ServerSocketChannel;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

public class Common extends CommonG {

    Connection myConnection = null;

    public Common(){

    }

    private ServerSocketChannel serverSocket;
    private Socket socket;

    public ServerSocketChannel getServerSocket() {
        return serverSocket;
    }

    public void setServerSocket(ServerSocketChannel serverSocket) {
        this.serverSocket = serverSocket;
    }

    public Socket getSocket() {
        return socket;
    }

    public void setSocket(Socket socket) {
        this.socket = socket;
    }

    /*
     * connects to database with parameters:
     *
     * @param database
     * @param host
     * @param port
     * @param user
     * @param password
     *
     * Also saves connection
     *
     */
    public void connectToDatabase(String database, String host, String port, String user, String password, Boolean secure) throws Exception {
        try {
            Class.forName("org.postgresql.Driver");
            if (port.startsWith("[")) {
                port = port.substring(1,port.length()-1);
            }
            if(!secure) {
                myConnection = DriverManager
                        .getConnection("jdbc:postgresql://" + host + ":" + port + "/" + database,
                                user, password);
            }else {

                Properties props = new Properties();
                props.setProperty("user", user);
                props.setProperty("password", password);

                props.setProperty("ssl","true");
                props.setProperty("sslmode", "verify-full");
                props.setProperty("sslcert", "src/test/resources/credentials/postgres.crt");
                props.setProperty("sslkey", "src/test/resources/credentials/postgresql.pk8");
                props.setProperty("sslrootcert", "src/test/resources/credentials/stratio-ca.crt");

                myConnection = DriverManager
                        .getConnection("jdbc:postgresql://" + host + ":" + port + "/" + database, props);

            }

        } catch (Exception e) {
            e.printStackTrace();
            assertThat(myConnection).as(e.getClass().getName() + ": " + e.getMessage()).isNotNull();
        }
    }

    /*
     * @return connection object
     *
     */
    public Connection getConnection() {
        return this.myConnection;
    }

}
