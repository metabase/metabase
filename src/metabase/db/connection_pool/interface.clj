(ns metabase.db.connection-pool.interface)

(defn- dispatch-on-backend [backend & _] backend)

#_(def connection-pool-spec nil) ; NOCOMMIT

(defmulti connection-pool-spec
  "Create a new connection pool for a JDBC `spec` and return a spec for it. Optionally pass a map of connection pool
  properties."
  {:arglists '([backend jdbc-spec] [backend jdbc-spec pool-properties])}
  dispatch-on-backend)

#_(def destroy-connection-pool! nil) ; NOCOMMIT

(defmulti destroy-connection-pool!
  "Immediately release all resources held by a connection pool.

  (This is the internal implementation of `metabase.db.connection-pool/destroy-connection-pool!`; unless you are
  providing a new connection pooling backend,"
  {:arglists '([backend pool-spec])}
  dispatch-on-backend)
