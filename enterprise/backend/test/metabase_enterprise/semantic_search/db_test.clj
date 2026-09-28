(ns metabase-enterprise.semantic-search.db-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource PooledDataSource)
   (java.sql SQLException SQLTimeoutException)
   (java.util.logging Handler Level LogRecord Logger)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(deftest connection-pool-initialization-test
  (testing "Connection pool can be initialized and tested"
    (when semantic.db.datasource/db-url
      ;; Reset the data source to ensure clean test
      (reset! semantic.db.datasource/data-source nil)
      (testing "Data source is nil before initialization"
        (is (nil? @semantic.db.datasource/data-source)))
      (testing "init-db! creates a pooled data source"
        (semantic.db.datasource/init-db!)
        (is (some? @semantic.db.datasource/data-source))
        (is (instance? PoolBackedDataSource @semantic.db.datasource/data-source)))
      (testing "test-connection! works with pooled connection"
        (let [result (semantic.db.datasource/test-connection!)]
          (is (= {:test 1} result))))
      (testing "Connection pool properties are configured correctly"
        (when (instance? PoolBackedDataSource @semantic.db.datasource/data-source)
          (let [pool ^PoolBackedDataSource @semantic.db.datasource/data-source]
            ;; Test that pool is properly configured
            (is (<= (.getNumConnections pool) 5))
            (is (>= (.getNumConnections pool) 0))))))))

(deftest db-url-validation-test
  (testing "init-db! throws exception when DB URL is missing"
    (with-redefs [semantic.db.datasource/db-url nil
                  semantic.db.datasource/data-source (atom nil)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MB_PGVECTOR_DB_URL environment variable is required"
           (semantic.db.datasource/init-db!))))))

(deftest pool-hides-credentials-test
  (testing "the pool's string form, which c3p0 puts in its exception messages, leaves out the URL credentials"
    ;; db-url is a value, not a fn, so with-dynamic-fn-redefs can't bind it
    (with-redefs [semantic.db.datasource/db-url      "jdbc:postgresql://localhost:5432/mb?user=mb&password=hunter2"
                  semantic.db.datasource/data-source (atom nil)]
      (let [pool ^PooledDataSource (semantic.db.datasource/init-db!)]
        (.close pool)
        (let [e (is (thrown-with-msg? SQLException #"has been closed" (.getConnection pool)))]
          (is (not (str/includes? (str (ex-message e)) "hunter2")))
          (is (not (str/includes? (str pool) "hunter2"))))))))

(deftest unrecognized-url-hides-credentials-test
  (testing "the error for a URL no driver accepts, which quotes the URL, leaves out the credentials"
    ;; The driver rejects the `jdbc:postgres:` spelling, so DriverManager reports it with the URL.
    ;; Then next.jdbc retries with the right spelling, and only a failed retry lets that error through.
    (with-redefs [semantic.db.datasource/db-url "jdbc:postgres://pgvector.invalid/mb?user=mb&password=hunter2"]
      (let [e (is (thrown-with-msg? SQLException #"No suitable driver"
                                    (semantic.db.datasource/probe-dedicated-connection!)))]
        (is (not (str/includes? (str (ex-message e)) "hunter2")))))))

(deftest pgjdbc-debug-log-hides-credentials-test
  (testing "the URL the driver logs at DEBUG leaves out the credentials"
    (let [^Logger logger (Logger/getLogger "org.postgresql.Driver")
          level          (.getLevel logger)
          logged         (atom [])
          handler        (proxy [Handler] []
                           (publish [^LogRecord record]
                             (swap! logged conj [(.getMessage record) (vec (.getParameters record))]))
                           (flush [])
                           (close []))]
      (.setLevel logger Level/FINE)
      (.addHandler logger handler)
      (try
        ;; the .invalid domain never resolves, and the driver logs the URL before it tries to connect
        (with-redefs [semantic.db.datasource/db-url "jdbc:postgresql://pgvector.invalid/mb?user=mb&password=hunter2"]
          (is (thrown? SQLException (semantic.db.datasource/probe-dedicated-connection!))))
        (finally
          (.removeHandler logger handler)
          (.setLevel logger level)))
      (is (=? [["Connecting with URL: {0}" ["jdbc:postgresql://pgvector.invalid/mb?connectTimeout=5&socketTimeout=10"]]]
              (filter #(str/starts-with? (first %) "Connecting with URL") @logged))))))

(deftest test-connection-before-init-test
  (testing "test-connection! throws exception when pool not initialized"
    (let [orig-data-source @semantic.db.datasource/data-source]
      (try
        (reset! semantic.db.datasource/data-source nil)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Semantic search connection pool is not initialized"
             (semantic.db.datasource/test-connection!)))
        (finally
          (reset! semantic.db.datasource/data-source orig-data-source))))))

(deftest probe-dedicated-connection-test
  (testing "the readiness probe connects without initializing the dedicated pool"
    (when semantic.db.datasource/db-url
      (with-redefs [semantic.db.datasource/data-source (atom nil)]
        (is (= {:test 1} (semantic.db.datasource/probe-dedicated-connection!)))
        (is (nil? @semantic.db.datasource/data-source))))))

(def ^:private parse-db-url #'semantic.db.datasource/parse-db-url)

(def ^:private probe-jdbc-url #'semantic.db.datasource/probe-jdbc-url)

(def ^:private base-url "jdbc:postgresql://localhost:5432/mb_semantic_search")

(defn- userinfo-url
  "[[base-url]] with `userinfo` written before the host."
  [userinfo]
  (str "jdbc:postgresql://" userinfo "@localhost:5432/mb_semantic_search"))

(deftest probe-jdbc-url-test
  (testing "the probe URL fills in the fail-fast timeouts the one-shot datasource would otherwise lack"
    ;; db-url is a value, not a fn, so with-dynamic-fn-redefs can't bind it
    (with-redefs [semantic.db.datasource/db-url base-url]
      (is (= (str base-url "?connectTimeout=5&socketTimeout=10")
             (probe-jdbc-url)))))
  (testing "a timeout the operator set on MB_PGVECTOR_DB_URL is replaced, not deferred to"
    ;; An abandoned probe can't be interrupted out of a socket read, so it must not inherit a long wait.
    (with-redefs [semantic.db.datasource/db-url (str base-url "?socketTimeout=60")]
      (is (= (str base-url "?connectTimeout=5&socketTimeout=10")
             (probe-jdbc-url)))))
  (testing "unrelated connection params pass through, in the order they were written"
    (with-redefs [semantic.db.datasource/db-url (str base-url "?tcpKeepAlive=true&sslmode=require")]
      (is (= (str base-url "?tcpKeepAlive=true&sslmode=require&connectTimeout=5&socketTimeout=10")
             (probe-jdbc-url))))))

(deftest parse-db-url-defaults-test
  (testing "a URL with no params leaves the URL untouched and uses the default pool props"
    ;; strict = (not =?) so an unexpected extra/missing prop also fails, not just a wrong value
    (is (= {:jdbc-url    base-url
            :credentials {}
            :pool-props  {;; tunable knobs at their defaults
                          "maxPoolSize"                          5
                          "minPoolSize"                          0
                          "initialPoolSize"                      0
                          "checkoutTimeout"                      10000
                          "unreturnedConnectionTimeout"          0
                          "debugUnreturnedConnectionStackTraces" false
                          "testConnectionOnCheckout"             false
                          ;; fixed props operators can't override
                          "idleConnectionTestPeriod"             60
                          "maxIdleTimeExcessConnections"         600
                          "maxConnectionAge"                     1800
                          "acquireIncrement"                     1
                          "dataSourceName"                       "metabase-semantic-search-db"}}
           (parse-db-url base-url)))))

(deftest parse-db-url-pool-knob-test
  (testing "a recognized pool knob is pulled off the URL, parsed, and merged over the defaults"
    (is (=? {:jdbc-url   base-url
             :pool-props {"maxPoolSize" 12}}
            (parse-db-url (str base-url "?maxPoolSize=12")))))
  (testing "a boolean knob coerces case-insensitively"
    (is (=? {:pool-props {"testConnectionOnCheckout" true}}
            (parse-db-url (str base-url "?testConnectionOnCheckout=TRUE"))))))

(deftest parse-db-url-connection-param-test
  (testing "a recognized Postgres connection param stays on the URL for pgjdbc"
    (is (=? {:jdbc-url (str base-url "?tcpKeepAlive=true")}
            (parse-db-url (str base-url "?tcpKeepAlive=true")))))
  (testing "pool knobs are stripped while connection params are retained, in order"
    (is (=? {:jdbc-url   (str base-url "?sslmode=require&tcpKeepAlive=true")
             :pool-props {"maxPoolSize" 8}}
            (parse-db-url (str base-url "?sslmode=require&maxPoolSize=8&tcpKeepAlive=true")))))
  (testing "credentials move off the URL, decoded, to be passed as connection properties"
    (is (= {:jdbc-url    (str base-url "?tcpKeepAlive=true")
            :credentials {:user        "postgres"
                          :password    "p&ss=word"
                          :sslpassword "k3y@pass"}}
           (select-keys (parse-db-url (str base-url "?user=postgres&password=p%26ss%3Dword&tcpKeepAlive=true"
                                           "&sslpassword=k3y%40pass"))
                        [:jdbc-url :credentials]))))
  (testing "credentials in the host part come off the URL too, with %-escapes decoded and a `+` kept as is"
    (is (= {:jdbc-url    (str base-url "?tcpKeepAlive=true")
            :credentials {:user "postgres", :password "p@ss:w+rd"}}
           (select-keys (parse-db-url (str (userinfo-url "postgres:p%40ss:w+rd") "?tcpKeepAlive=true"))
                        [:jdbc-url :credentials]))))
  (testing "an unencoded `@` in a host-part password still leaves the whole password off the URL"
    (is (=? {:jdbc-url base-url, :credentials {:user "postgres", :password "p@ss"}}
            (parse-db-url (userinfo-url "postgres:p@ss")))))
  (testing "host-part credentials come off whatever the scheme, even one no driver accepts"
    ;; CI spells the scheme `jdbc:postgres:`, and `jdbc:postgresq:` is a typo DriverManager would quote
    (doseq [scheme ["jdbc:postgres://" "jdbc:postgresq://"]]
      (is (=? {:jdbc-url    (str scheme "localhost:5432/mb_semantic_search")
               :credentials {:user "postgres", :password "secret"}}
              (parse-db-url (str scheme "postgres:secret@localhost:5432/mb_semantic_search"))))))
  (testing "a credential set both in the host part and in the query throws, without quoting either value"
    (let [e (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"The pgvector URL sets password both before the host and as a parameter"
                 (parse-db-url (str (userinfo-url "postgres:secret") "?password=other"))))]
      (is (not (re-find #"secret|other" (str (ex-message e) (ex-data e)))))))
  (testing "an unencoded `@` in a query value passes through, as pgjdbc accepts it"
    (doseq [url [(str base-url "?user=mylogin@srv&password=p@ss")
                 "jdbc:postgresql://?service=pgvector&user=mylogin@srv&password=p@ss"]]
      (is (=? {:credentials {:user "mylogin@srv", :password "p@ss"}}
              (parse-db-url url))))))

(deftest parse-db-url-validation-test
  (testing "an unrecognized param throws rather than being silently ignored by pgjdbc"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unknown pgvector URL parameter maxPoolSizee"
         (parse-db-url (str base-url "?maxPoolSizee=5")))))
  (testing "a malformed pool-knob value throws"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid value for pgvector pool parameter maxPoolSize"
         (parse-db-url (str base-url "?maxPoolSize=lots")))))
  (testing "an `@` outside the host part throws without quoting the URL"
    (doseq [url ["jdbc:postgresql://alice:se/cret@db/mb"            ; `/` in the password
                 "jdbc:postgresql://alice:se?cret@db/mb"            ; `?` in the password
                 "jdbc:postgresql://alice:se?service=cret@db/mb"    ; `?`, putting the `@` in a param
                 "jdbc:postgresql://alice:s@e?cret@db/mb"           ; `@` and then `?` in the password
                 "jdbc:postgresql://alice:secret@db/mb@elsewhere"]] ; `@` in the database name
      (let [e (is (thrown? clojure.lang.ExceptionInfo (parse-db-url url)))]
        (is (=? {:message (str "MB_PGVECTOR_DB_URL has an unencoded @ outside its credentials. "
                               "Percent-encode reserved characters, e.g. @ as %40, / as %2F and ? as %3F.")
                 :data    {}}
                {:message (ex-message e), :data (ex-data e)}))
        (is (not (re-find #"cret|elsewhere" (str (ex-message e) (ex-data e))))))))
  (testing "a malformed %-escape in a credential throws without quoting any of the value"
    (let [e (is (thrown? clojure.lang.ExceptionInfo (parse-db-url (str base-url "?password=hunter%zz"))))]
      (is (=? {:message "Malformed %-escape in MB_PGVECTOR_DB_URL", :data {}, :cause nil}
              {:message (ex-message e), :data (ex-data e), :cause (ex-cause e)})))))

(deftest pool-props-applied-by-c3p0-test
  (testing "c3p0 actually understands and applies every pool property name we set"
    ;; We hand c3p0 a Properties map; like pgjdbc, c3p0 silently ignores names it doesn't recognize, so a
    ;; typo in our prop map would quietly fall back to a c3p0 default. Read the effective config back from
    ;; the pool to prove each name took effect. The values below all differ from c3p0's own defaults, so a
    ;; dropped property would surface as a mismatch.
    (when semantic.db.datasource/db-url
      (let [url (str semantic.db.datasource/db-url
                     "&minPoolSize=2"
                     "&initialPoolSize=2"
                     "&maxPoolSize=9"
                     "&checkoutTimeout=4321"
                     "&unreturnedConnectionTimeout=77"
                     "&debugUnreturnedConnectionStackTraces=true"
                     "&testConnectionOnCheckout=true")]
        (with-redefs [semantic.db.datasource/db-url      url
                      semantic.db.datasource/data-source (atom nil)]
          (try
            (semantic.db.datasource/init-db!)
            (let [pool-ds ^PoolBackedDataSource @semantic.db.datasource/data-source
                  cpds    (.getConnectionPoolDataSource pool-ds)]
              (is (=? {;; tunable knobs supplied on the URL
                       :maxPoolSize                          9
                       :minPoolSize                          2
                       :initialPoolSize                      2
                       :checkoutTimeout                      4321
                       :unreturnedConnectionTimeout          77
                       :debugUnreturnedConnectionStackTraces true
                       :testConnectionOnCheckout             true
                       ;; fixed props we always set, on the connection-pool DS
                       :idleConnectionTestPeriod             60
                       :maxIdleTimeExcessConnections         600
                       :maxConnectionAge                     1800
                       :acquireIncrement                     1}
                      (bean cpds)))
              ;; dataSourceName is the one fixed prop that lives on the outer pooled DS, not the cpds
              (is (= "metabase-semantic-search-db" (.getDataSourceName pool-ds))))
            (finally
              (semantic.db.datasource/shutdown-db!))))))))

(def ^:private can-provision? #'semantic.db.datasource/app-db-can-provision-pgvector?)

(defn- failing-datasource
  "A datasource whose every connection attempt throws `e`, so the provisioning check fails before it can
  ask the question."
  ^DataSource [^Exception e]
  (reify DataSource
    (getConnection [_] (throw e))
    (getConnection [_ _ _] (throw e))))

(deftest app-db-can-provision-pgvector-distinguishes-refusal-from-failure-test
  (testing "the database refusing to provision is an answer, and reads as no"
    (doseq [[state what] {"42501" "the role lacks CREATE"
                          "0A000" "the extension is not available on this server"
                          "58P01" "the extension's control file is missing"}]
      (testing what
        ;; Hinted: SQLException also has a (String, Throwable) ctor, so untyped args reflect.
        (is (false? (can-provision? (failing-datasource (SQLException. ^String what ^String state))
                                    true true))))))
  (testing "a check that never got an answer throws, rather than reading as a settled no"
    (doseq [[e what] {(SQLTimeoutException. "statement timeout" "57014") "a timed-out DDL probe"
                      (SQLException. "connection refused" "08006")      "a dropped connection"
                      (SQLException. "too many connections" "53300")    "an exhausted server"
                      (InterruptedException. "abandoned")               "an interrupted probe"}]
      (testing what
        (is (thrown? Exception (can-provision? (failing-datasource e) true true))))))
  (testing "a refusal wrapped in another exception is still recognised"
    (let [wrapped (SQLException. "rollback failed" "25P02" (SQLException. "denied" "42501"))]
      (is (false? (can-provision? (failing-datasource wrapped) true true)))))
  (testing "a refusal hung off getNextException is still recognised"
    ;; JDBC chains sibling errors there rather than through getCause, so a cause-only walk misses it.
    (let [chained (doto (SQLException. "batch failed" "25P02")
                    (.setNextException (SQLException. "denied" "42501")))]
      (is (false? (can-provision? (failing-datasource chained) true true))))))
