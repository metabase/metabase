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

import cucumber.api.java.en.When;

import java.io.BufferedReader;
import java.io.FileReader;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.nio.channels.ServerSocketChannel;

import static com.stratio.qa.assertions.Assertions.assertThat;

public class WhenSpec extends BaseSpec {

    public WhenSpec(Common spec) {
        this.commonspec = spec;
    }

    @When("^I start a socket in '([^:]+?):(.+?)?'$")
    public void startSocket(String socketHost, String socketPort) throws java.io.IOException, java.net.UnknownHostException {
        assertThat(socketHost).isNotEmpty();
        assertThat(socketPort).isNotEmpty();
        commonspec.getLogger().info("Creating socket at: " + socketHost + ":" + socketPort);
        commonspec.setServerSocket(ServerSocketChannel.open());
        commonspec.getServerSocket().socket().bind(new InetSocketAddress(socketHost, Integer.parseInt(socketPort)));
    }


    @When("^I send data from file '([^:]+?)' to socket$")
    public void sendDataToSocket(String baseData) throws java.io.IOException, java.io.FileNotFoundException {
        String line = "";
        PrintStream out = new PrintStream(commonspec.getServerSocket().socket().accept().getOutputStream());
        BufferedReader br = new BufferedReader(new FileReader(baseData));

        while ((line = br.readLine()) != null) {
            // use comma as separator
            String[] data = line.split(",");
            out.println(line);
        }
        out.flush();
    }
}
