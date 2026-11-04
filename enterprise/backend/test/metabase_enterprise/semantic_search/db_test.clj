(ns metabase-enterprise.semantic-search.db-test
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource PooledDataSource WrapperConnectionPoolDataSource)
   (java.sql DriverManager SQLException)
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

(deftest pool-hides-credentials-test
  (testing "the pool's string form, which c3p0 puts in its exception messages, leaves out the URL credentials"
    ;; db-url is a value, not a fn, so with-dynamic-fn-redefs can't bind it
    (with-redefs [semantic.db.datasource/db-url      "jdbc:postgresql://pgvector.invalid/mb?user=mb&password=hunter2"
                  semantic.db.datasource/data-source (atom nil)]
      (let [pool ^PooledDataSource (semantic.db.datasource/init-db!)]
        (.close pool)
        (let [e (is (thrown-with-msg? SQLException #"has been closed" (.getConnection pool)))]
          (is (not (str/includes? (str (ex-message e)) "hunter2")))
          (is (not (str/includes? (str pool) "hunter2"))))))))

(defn- connect-through-pool!
  "Open a connection through the data source the pool wraps, on this thread, then close the pool."
  []
  (let [pool ^PoolBackedDataSource (semantic.db.datasource/init-db!)]
    (try
      (.getConnection ^DataSource (.getNestedDataSource ^WrapperConnectionPoolDataSource
                                   (.getConnectionPoolDataSource pool)))
      (finally
        (.close pool)))))

(deftest unrecognized-url-hides-credentials-test
  (testing "the error for a URL no driver accepts, which quotes the URL, leaves out the credentials"
    ;; The driver rejects the `jdbc:postgres:` spelling, so DriverManager reports it with the URL.
    ;; Then next.jdbc retries with the right spelling, and only a failed retry lets that error through.
    (with-redefs [semantic.db.datasource/db-url      "jdbc:postgres://pgvector.invalid/mb?user=mb&password=hunter2"
                  semantic.db.datasource/data-source (atom nil)]
      (let [e (is (thrown-with-msg? SQLException #"No suitable driver" (connect-through-pool!)))]
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
      ;; the driver's first connection in a JVM logs its configuration instead of the URL, so make one first
      (try (DriverManager/getConnection "jdbc:postgresql://pgvector.invalid/mb") (catch SQLException _))
      (.setLevel logger Level/FINE)
      (.addHandler logger handler)
      (try
        ;; the .invalid domain never resolves, and the driver logs the URL before it tries to connect
        (with-redefs [semantic.db.datasource/db-url      "jdbc:postgresql://pgvector.invalid/mb?user=mb&password=hunter2"
                      semantic.db.datasource/data-source (atom nil)]
          (is (thrown? SQLException (connect-through-pool!))))
        (finally
          (.removeHandler logger handler)
          (.setLevel logger level)))
      (is (=? [["Connecting with URL: {0}" ["jdbc:postgresql://pgvector.invalid/mb"]]]
              (filter #(str/starts-with? (first %) "Connecting with URL") @logged))))))

(def ^:private parse-db-url #'semantic.db.datasource/parse-db-url)

(def ^:private base-url "jdbc:postgresql://localhost:5432/mb_semantic_search")

(deftest parse-db-url-credentials-test
  (testing "credentials move off the URL, decoded, to be passed as connection properties"
    (is (= {:jdbc-url    (str base-url "?tcpKeepAlive=true")
            :credentials {:user        "postgres"
                          :password    "p&ss=word"
                          :sslpassword "k3y@pass"}}
           (parse-db-url (str base-url "?user=postgres&password=p%26ss%3Dword&tcpKeepAlive=true"
                              "&sslpassword=k3y%40pass")))))
  (testing "other params stay on the URL as written"
    (is (= {:jdbc-url (str base-url "?sslmode=require&options=-c%20foo=bar"), :credentials {}}
           (parse-db-url (str base-url "?sslmode=require&options=-c%20foo=bar"))))))

(defn- userinfo-url
  "[[base-url]] with `userinfo` written before the host."
  [userinfo]
  (str "jdbc:postgresql://" userinfo "@localhost:5432/mb_semantic_search"))

(deftest parse-db-url-host-part-credentials-test
  (testing "credentials in the host part come off the URL too, with %-escapes decoded and a `+` kept as is"
    (is (= {:jdbc-url    (str base-url "?tcpKeepAlive=true")
            :credentials {:user "postgres", :password "p@ss:w+rd"}}
           (parse-db-url (str (userinfo-url "postgres:p%40ss:w+rd") "?tcpKeepAlive=true")))))
  (testing "an unencoded `@` in a host-part password still leaves the whole password off the URL"
    (is (= {:jdbc-url base-url, :credentials {:user "postgres", :password "p@ss"}}
           (parse-db-url (userinfo-url "postgres:p@ss")))))
  (testing "host-part credentials come off whatever the scheme, even one no driver accepts"
    ;; CI spells the scheme `jdbc:postgres:`, and `jdbc:postgresq:` is a typo DriverManager would quote
    (doseq [scheme ["jdbc:postgres://" "jdbc:postgresq://"]]
      (is (= {:jdbc-url    (str scheme "localhost:5432/mb_semantic_search")
              :credentials {:user "postgres", :password "secret"}}
             (parse-db-url (str scheme "postgres:secret@localhost:5432/mb_semantic_search"))))))
  (testing "a credential set both in the host part and in the query throws, without quoting either value"
    (let [e (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"The pgvector URL sets password both before the host and as a parameter"
                 (parse-db-url (str (userinfo-url "postgres:secret") "?password=other"))))]
      (is (not (re-find #"secret|other" (str (ex-message e) (ex-data e)))))))
  (testing "an unencoded `@` in a credential value passes through, as pgjdbc accepts it"
    (doseq [url [(str base-url "?user=mylogin@srv&password=p@ss")
                 "jdbc:postgresql://?service=pgvector&user=mylogin@srv&password=p@ss"]]
      (is (=? {:credentials {:user "mylogin@srv", :password "p@ss"}}
              (parse-db-url url)))))
  (testing "the host list may name several hosts, IPv6 addresses, or none"
    (doseq [url ["jdbc:postgresql://db1:5432,db_2,[::1]:5433,[fe80::1%25eth0],[fe80::1%25br-test]:5432/mb"
                 "jdbc:postgresql:///mb_semantic_search"
                 "jdbc:postgresql://?service=pgvector"
                 "jdbc:postgresql:mb_semantic_search"]]
      (is (=? {:jdbc-url url} (parse-db-url url)))))
  (testing "an encoded `@` in another param's value stays on the URL as written"
    (is (=? {:jdbc-url (str base-url "?sslrootcert=/certs/a%40b/ca.pem")}
            (parse-db-url (str base-url "?sslrootcert=/certs/a%40b/ca.pem"))))))

(deftest parse-db-url-malformed-test
  (testing "an `@` outside the host part and credential values throws without quoting the URL"
    (doseq [url ["jdbc:postgresql://alice:se/cret@db/mb"             ; `/` in the password
                 "jdbc:postgresql://alice:se?cret@db/mb"             ; `?` in the password
                 "jdbc:postgresql://alice:se?service=cret@db/mb"     ; `?`, putting the `@` in a param
                 "jdbc:postgresql://alice:s@e?cret@db/mb"            ; `@` and then `?` in the password
                 "jdbc:postgresql://alice:secret@db/mb@elsewhere"    ; `@` in the database name
                 "jdbc:postgresql://alice:se/c?cret@db/mb"           ; `/` and then `?` in the password
                 "jdbc:postgresql://alice:se/c?sslmode=cret@db/mb"
                 "jdbc:postgresql://alice:se/cret?service=word@db/mb"
                 "jdbc:postgresql://alice:se/c?x=cret@db"
                 "jdbc:postgresql://alice:se/c?x=cret@db:5432"
                 "jdbc:postgresql://alice:5432?sslmode=cret&password=word@db/mb"  ; digits and then `?` in the password
                 "jdbc:postgresql://alice:5432,cret?password=word@db/mb"
                 "jdbc:postgresql://alice:se?user=cret@db/mb"
                 "jdbc:postgresql://db?user=mylogin@srv"                         ; hosts but no path
                 (str base-url "?sslrootcert=/certs/a@b/ca.pem")]]  ; `@` in a non-credential value
      (testing url
        (let [e (is (thrown? clojure.lang.ExceptionInfo (parse-db-url url)))]
          (is (= {:message (str "MB_PGVECTOR_DB_URL has an unencoded @ outside its credentials. "
                                "Percent-encode reserved characters, e.g. @ as %40, / as %2F and ? as %3F.")
                  :data    {}}
                 {:message (ex-message e), :data (ex-data e)}))))))
  (testing "a host list that isn't hosts and ports throws without quoting it"
    (doseq [url ["jdbc:postgresql://alice:se/c?password=cret@db/mb"     ; `/` and then `?` in the password
                 "jdbc:postgresql://alice:se/c?user=cret@db/mb"
                 "jdbc:postgresql://alice:se/c\nx?password=cret@db/mb"  ; a line break after the `/`
                 "jdbc:postgresql://alice:se/c\r\nx?password=cret@db/mb"
                 "jdbc:postgresql://alice:se/c\u2028x?password=cret@db/mb"
                 "jdbc:postgresql://db:port/mb"
                 "jdbc:postgresql://db:5432,/mb"]]
      (testing url
        (let [e (is (thrown? clojure.lang.ExceptionInfo (parse-db-url url)))]
          (is (= {:message (str "MB_PGVECTOR_DB_URL has a malformed host list. Percent-encode reserved "
                                "characters in its credentials, e.g. @ as %40, / as %2F and ? as %3F.")
                  :data    {}}
                 {:message (ex-message e), :data (ex-data e)}))))))
  (testing "a malformed %-escape in a credential throws without quoting any of the value"
    (let [e (is (thrown? clojure.lang.ExceptionInfo (parse-db-url (str base-url "?password=hunter%zz"))))]
      (is (=? {:message "Malformed %-escape in MB_PGVECTOR_DB_URL", :data {}, :cause nil}
              {:message (ex-message e), :data (ex-data e), :cause (ex-cause e)})))))

(def ^:private password-fragments
  "Distinct words to join into generated passwords. None appears anywhere else in a generated URL, so finding
  one outside the parsed credentials means part of the password went there."
  ["kiwi" "plum" "pear" "lime" "date" "fig" "yuzu"])

(defn- generated-passwords
  "Passwords made of [[password-fragments]] joined by every ordering of every non-empty subset of the URL's
  reserved characters, and the same with each fragment after a `?` or `&` named as a credential param."
  []
  (for [chars  (mapcat math.combo/permutations (rest (math.combo/subsets [\/ \? \@ \: \& \=])))
        param? [false true]
        :let   [words (map (fn [prev-char fragment]
                             (if (and param? (#{\? \&} prev-char)) "password" fragment))
                           (cons nil chars)
                           password-fragments)]]
    (apply str (interleave words (concat chars [""])))))

(defn- percent-encode [^String s]
  (str/replace s #"[%/?@:&=]" #(format "%%%02X" (int (first %)))))

(deftest parse-db-url-generated-password-test
  (let [hosts ["db.example:5432/mb" "db.example/mb?sslmode=require" "db.example" "db1:5432,db2:5433/mb"]]
    (testing "a host-part password with unencoded reserved characters never reaches an error or the URL"
      (let [leaks (for [password (generated-passwords)
                        host     hosts
                        :let     [url    (str "jdbc:postgresql://alice:" password "@" host)
                                  result (try
                                           (dissoc (parse-db-url url) :credentials)
                                           (catch Throwable e
                                             [(ex-message e) (ex-data e) (some-> (ex-cause e) ex-message)]))
                                  leaked (filter #(str/includes? (str result) %) password-fragments)]
                        :when    (seq leaked)]
                    {:url url, :leaked leaked})]
        (is (empty? (take 5 leaks)))))
    (testing "the same passwords percent-encoded parse, with the password off the URL"
      (let [failures (for [password (generated-passwords)
                           host     hosts
                           :let     [url      (str "jdbc:postgresql://alice:" (percent-encode password) "@" host)
                                     expected {:jdbc-url    (str "jdbc:postgresql://" host)
                                               :credentials {:user "alice", :password password}}
                                     actual   (try
                                                (select-keys (parse-db-url url) [:jdbc-url :credentials])
                                                (catch Throwable e (ex-message e)))]
                           :when    (not= expected actual)]
                       {:url url, :actual actual})]
        (is (empty? (take 5 failures)))))))
