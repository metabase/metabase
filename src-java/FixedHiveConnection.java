/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.metabase.hive.jdbc;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Properties;

import org.apache.hive.jdbc.HiveConnection;

public class FixedHiveConnection extends HiveConnection {

    public FixedHiveConnection(String uri, Properties info) throws SQLException {
        super(uri, info);
    }

    @Override
    public int getHoldability() throws SQLException {
        return ResultSet.CLOSE_CURSORS_AT_COMMIT;
    }

    // From https://issues.apache.org/jira/browse/HIVE-11501
    @Override
    public void setReadOnly(boolean readOnly) throws SQLException {
        // Per JDBC spec, if the connection is closed a SQLException should be thrown.
        if (isClosed()) {
            throw new SQLException("Connection is closed");
        }
        // Per JDBC spec, the request defines a hint to the driver to enable database optimizations.
        // The read-only mode for this connection is disabled and cannot be enabled (isReadOnly always returns false).
        // The most correct behavior is to throw only if the request tries to enable the read-only mode.
        if(readOnly) {
            throw new SQLException("Enabling read-only mode not supported");
        }
    }
}
