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

(defmethod spec :mysql
  [_ {:keys [host port db aws-iam ssl-cert]
      :or   {host "localhost", port 3306, db ""}
      :as   opts}]
  (merge
   {:classname   "org.mariadb.jdbc.Driver"
    :subprotocol "mysql"
    :subname     (make-subname host (or port 3306) db)}
   (when aws-iam
     (merge
      (make-aws-iam-spec "mysql")
      (cond
        (= ssl-cert "trust")
        {:trustServerCertificate true}

        (and ssl-cert (not= ssl-cert "trust"))
        {:sslMode       "VERIFY_CA"
         :serverSslCert ssl-cert}

        :else
        {:sslMode "VERIFY_CA"})))
   (dissoc opts :host :port :db :aws-iam :ssl-cert)))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!   Don't put database spec functions for new drivers in this namespace. These ones are only here because they  !!
;; !!  can also be used for the application DB in metabase.driver. Put functions like these for new drivers in the  !!
;; !!                                            driver namespace itself.                                           !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
