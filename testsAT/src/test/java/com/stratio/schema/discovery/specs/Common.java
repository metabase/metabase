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

    private ServerSocketChannel serverSocket;
    private Socket socket;
    public Common() {

    }

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

}
