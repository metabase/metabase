(ns metabase.app-db.spec
  "Functions for creating JDBC DB specs for a given driver.
  Only databases that are supported as application DBs should have functions in this namespace;
  otherwise, similar functions are only needed by drivers, and belong in those namespaces."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]))

(defmulti spec
  "Create a [[clojure.java.jdbc]] spec map from broken-out database `details`."
  {:arglists '([db-type details])}
  (fn [db-type _details]
    (keyword db-type)))

(defmethod spec :h2
  [_ {:keys [db]
      :or   {db "h2.db"}
      :as   opts}]
  (merge {:classname   "org.h2.Driver"
          :subprotocol "h2"
          :subname     db}
         (dissoc opts :db)))

(defn make-subname
  "Make a subname for the given `host`, `port`, and `db` params.  Iff `db` is not blank, then a slash will
  precede it in the subname."
  {:arglists '([host port db]), :added "0.39.0"}
  [host port db]
  (str "//" (when-not (str/blank? host) (str host ":" port)) (if-not (str/blank? db) (str "/" db) "/")))

(defn- make-aws-iam-spec [subprotocol]
  {:subprotocol (str "aws-wrapper:" subprotocol)
   :classname "software.amazon.jdbc.ds.AwsWrapperDataSource"
   :useSSL true
   :wrapperPlugins "iam"})

(defmethod spec :postgres
  [_ {:keys [host port db aws-iam]
      :or   {host "localhost", port 5432, db ""}
      :as   opts}]
  (merge
   {:classname                     "org.postgresql.Driver"
    :subprotocol                   "postgresql"
    :subname                       (make-subname host (or port 5432) db)
    ;; I think this is done to prevent conflicts with redshift driver registering itself to handle postgres://
    :OpenSourceSubProtocolOverride true
    :ApplicationName               config/mb-version-and-process-identifier}
   (when aws-iam
     (make-aws-iam-spec "postgresql"))
   (dissoc opts :host :port :db :aws-iam)))

(defn append-url-param
  "Append a `param=value` pair to a connection subname/URL, using `&` when it already has a query string."
  [url param]
  (str url (if (str/includes? url "?") "&" "?") param))

(defmethod spec :mysql
  [_ {:keys [host port db aws-iam ssl-cert]
      :or   {host "localhost", port 3306, db ""}
      :as   opts}]
  (merge
   {:classname   "org.mariadb.jdbc.Driver"
    :subprotocol "mysql"
    ;; mariadb-java-client 3.x only claims `jdbc:mysql:` URLs when the URL string itself contains
    ;; `permitMysqlScheme` (`Driver.acceptsURL` never sees the Properties), so it must ride the subname
    :subname     (append-url-param (make-subname host (or port 3306) db) "permitMysqlScheme=true")
    ;; mariadb-java-client 3.x flipped this default to `false`, making nil-catalog metadata calls
    ;; (`DatabaseMetaData.getTables` etc.) scan every schema on the server. The appdb relies on current-db
    ;; scoping — liquibase's `fresh-install?` check mistakes another schema's DATABASECHANGELOG for its
    ;; own and fresh installs then fail to start. Same pin as the warehouse driver's
    ;; [[metabase.driver.mysql/default-connection-args]] (see #75929 for the full rationale).
    :nullCatalogMeansCurrent true}
   (when aws-iam
     ;; the wrapper's `mariadb` protocol, not `mysql`: it resolves `mysql` to Connector/J (com.mysql.cj),
     ;; which is not on our classpath, and its DriverManager fallback strips the query string, so
     ;; `permitMysqlScheme` never reaches the mariadb driver. The `mariadb` protocol hands the driver a
     ;; jdbc:mariadb: URL it accepts unconditionally.
     ;;
     ;; No :useSSL — mariadb 3.x's legacy-SSL handler escalates `useSSL` to verify-full, clobbering the
     ;; :sslMode below (breaks hostname-mismatched endpoints like RDS Proxy custom endpoints); TRUST and
     ;; VERIFY_CA say everything we mean. `trustServerCertificate` is likewise only read by that legacy
     ;; handler, so the trust case must be spelled :sslMode "TRUST".
     (merge
      (dissoc (make-aws-iam-spec "mariadb") :useSSL)
      (cond
        (= ssl-cert "trust") {:sslMode "TRUST"}
        ssl-cert             {:sslMode "VERIFY_CA", :serverSslCert ssl-cert}
        :else                {:sslMode "VERIFY_CA"})))
   (dissoc opts :host :port :db :aws-iam :ssl-cert)))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!   Don't put database spec functions for new drivers in this namespace. These ones are only here because they  !!
;; !!  can also be used for the application DB in metabase.driver. Put functions like these for new drivers in the  !!
;; !!                                            driver namespace itself.                                           !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
