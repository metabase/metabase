(ns ^{:added "0.50.0"} metabase.driver.sql-jdbc.proxy-connection
  "Wrapper for `java.sql.Connection` that adds mutable metadata. The main reason for this is so we can record things
  like the session timezone we set the connection to, so we can avoid setting it every time we use the connection."
  (:require
   [potemkin :as p]
   [pretty.core :as pretty])
  (:import
   (java.sql Connection PreparedStatement)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(declare ->ProxyConnection)

(p/deftype+ ProxyConnection [^Connection conn metadata]
  pretty/PrettyPrintable
  (pretty [_this]
    (-> (list `proxy-connection conn)
        (with-meta @metadata)))

  clojure.lang.IMeta
  (meta [_this]
    @metadata)

  clojure.lang.IObj
  (withMeta [_this new-metadata]
    (->ProxyConnection conn (atom new-metadata)))

  clojure.lang.IReference
  (alterMeta [_this f args]
    (apply swap! metadata f args))

  (resetMeta [_this new-metadata]
    (reset! metadata new-metadata))

  Object
  (equals [_this another]
    (and (instance? ProxyConnection another)
         (= conn (.conn ^ProxyConnection another))))

  (toString [this]
    (pr-str (pretty/pretty this)))

  java.sql.Wrapper
  (isWrapperFor [this klass]
    (or (instance? klass this)
        (instance? klass conn)
        (.isWrapperFor conn klass)))

  (unwrap [this klass]
    (cond
      (instance? klass this) this
      (instance? klass conn) conn
      :else                  (.unwrap conn klass)))

  Connection
  (abort [_this executor]
    (.abort conn executor))

  (beginRequest [_this]
    (.beginRequest conn))

  (clearWarnings [_this]
    (.clearWarnings conn))

  (close [_this]
    (.close conn))

  (commit [_this]
    (.commit conn))

  (createArrayOf [_this type-name elements]
    (.createArrayOf conn type-name elements))

  (createBlob [_this]
    (.createBlob conn))

  (createClob [_this]
    (.createClob conn))

  (createNClob [_this]
    (.createNClob conn))

  (createSQLXML [_this]
    (.createSQLXML conn))

  (createStatement [_this]
    (.createStatement conn))

  (createStatement [_this result-set-type result-set-concurrency]
    (.createStatement conn result-set-type result-set-concurrency))

  (createStatement [_this result-set-type result-set-concurrency result-set-holdability]
    (.createStatement conn result-set-type result-set-concurrency result-set-holdability))

  (createStruct [_this type-name attributes]
    (.createStruct conn type-name attributes))

  (endRequest [_this]
    (.endRequest conn))

  (getAutoCommit [_this]
    (.getAutoCommit conn))

  (getCatalog [_this]
    (.getCatalog conn))

  (getClientInfo [_this]
    (.getClientInfo conn))

  (getClientInfo [_this a-name]
    (.getClientInfo conn a-name))

  (getHoldability [_this]
    (.getHoldability conn))

  (getMetaData [_this]
    (.getMetaData conn))

  (getNetworkTimeout [_this]
    (.getNetworkTimeout conn))

  (getSchema [_this]
    (.getSchema conn))

  (getTransactionIsolation [_this]
    (.getTransactionIsolation conn))

  (getTypeMap [_this]
    (.getTypeMap conn))

  (getWarnings [_this]
    (.getWarnings conn))

  (isClosed [_this]
    (.isClosed conn))

  (isReadOnly [_this]
    (.isReadOnly conn))

  (isValid [_this timeout]
    (.isValid conn timeout))

  (nativeSQL [_this sql]
    (.nativeSQL conn sql))

  (prepareCall [_this sql]
    (.prepareCall conn sql))

  (prepareCall [_this sql result-set-type result-set-concurrency]
    (.prepareCall conn sql result-set-type result-set-concurrency))

  (prepareCall [_this sql result-set-type result-set-concurrency result-set-holdability]
    (.prepareCall conn sql result-set-type result-set-concurrency result-set-holdability))

  (^PreparedStatement prepareStatement [_this ^String sql]
   (.prepareStatement conn ^String sql))

  (^PreparedStatement prepareStatement [_this ^String sql ^int auto-generated-keys]
   (.prepareStatement conn ^String sql auto-generated-keys))

  (^PreparedStatement prepareStatement [_this ^String sql ^ints column-indexes]
   (.prepareStatement conn ^String sql column-indexes))

  (^PreparedStatement prepareStatement [_this ^String sql ^int result-set-type ^int result-set-concurrency]
   (.prepareStatement conn ^String sql result-set-type result-set-concurrency))

  (^PreparedStatement prepareStatement [_this ^String sql ^int result-set-type ^int result-set-concurrency ^int result-set-holdability]
   (.prepareStatement conn ^String sql result-set-type result-set-concurrency result-set-holdability))

  (^PreparedStatement prepareStatement [_this ^String sql ^"[Ljava.lang.String;" column-names]
   (.prepareStatement conn sql column-names))

  (releaseSavepoint [_this savepoint]
    (.releaseSavepoint conn savepoint))

  (rollback [_this]
    (.rollback conn))

  (rollback [_this savepoint]
    (.rollback conn savepoint))

  (setAutoCommit [_this auto-commit?]
    (.setAutoCommit conn auto-commit?))

  (setCatalog [_this catalog]
    (.setCatalog conn catalog))

  (setClientInfo [_this a-name value]
    (.setClientInfo conn a-name value))

  (setClientInfo [_this properties]
    (.setClientInfo conn properties))

  (setHoldability [_this holdability]
    (.setHoldability conn holdability))

  (setNetworkTimeout [_this executor milliseconds]
    (.setNetworkTimeout conn executor milliseconds))

  (setReadOnly [_this read-only?]
    (.setReadOnly conn read-only?))

  (setSavepoint [_this]
    (.setSavepoint conn))

  (setSavepoint [_this a-name]
    (.setSavepoint conn a-name))

  (setSchema [_this schema]
    (.setSchema conn schema))

  (setShardingKey [_this sharding-key]
    (.setShardingKey conn sharding-key))

  (setShardingKey [_this sharding-key super-sharding-key]
    (.setShardingKey conn sharding-key super-sharding-key))

  (setShardingKeyIfValid [_this sharding-key timeout]
    (.setShardingKeyIfValid conn sharding-key timeout))

  (setShardingKeyIfValid [_this sharding-key super-sharding-key timeout]
    (.setShardingKeyIfValid conn sharding-key super-sharding-key timeout))

  (setTransactionIsolation [_this level]
    (.setTransactionIsolation conn level))

  (setTypeMap [_this type-map]
    (.setTypeMap conn type-map)))

(p/deftype+ ProxyDataSource [^DataSource data-source]
  pretty/PrettyPrintable
  (pretty [_this]
    (list `proxy-data-source data-source))

  Object
  (equals [_this another]
    (and (instance? ProxyDataSource another)
         (= data-source (.data-source ^ProxyDataSource another))))

  (toString [this]
    (pr-str (pretty/pretty this)))

  java.sql.Wrapper
  (isWrapperFor [this klass]
    (or (instance? klass this)
        (instance? klass data-source)
        (.isWrapperFor data-source klass)))

  (unwrap [this klass]
    (cond
      (instance? klass this)        this
      (instance? klass data-source) data-source
      :else                         (.unwrap data-source klass)))

  DataSource
  (getConnection [_this]
    (-> (.getConnection data-source)
        (->ProxyConnection (atom nil))))

  (getConnection [_this username password]
    (-> (.getConnection data-source username password)
        (->ProxyConnection (atom nil)))))

(defn proxy-data-source
  "Wrap `data-source` with a new `DataSource` that will automatically wrap all `Connection`s` it returns
  in [[->ProxyConnection]]."
  [data-source]
  (if (instance? ProxyDataSource data-source)
    data-source
    (->ProxyDataSource data-source)))
