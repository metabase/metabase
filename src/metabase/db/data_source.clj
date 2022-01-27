(ns metabase.db.data-source
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [metabase.config :as config]
            [metabase.connection-pool :as pool]
            [metabase.db.spec :as db.spec]
            [potemkin :as p]
            [pretty.core :as pretty])
  (:import java.sql.DriverManager
           java.util.Properties))

(p/deftype+ DataSource [^String url ^Properties properties]
  pretty/PrettyPrintable
  (pretty [_]
    ;; in dev we can actually print out the details, it's useful in debugging. Everywhere else we should obscure them
    ;; because they're potentially sensitive.
    (if config/is-dev?
      (list `->DataSource url properties)
      (list `->DataSource (symbol "#_REDACTED") (symbol "#_REDACTED"))))

  javax.sql.DataSource
  (getConnection [_]
    (if properties
      (DriverManager/getConnection url properties)
      (DriverManager/getConnection url)))

  ;; we don't use (.getConnection this url user password) so we don't need to implement it.
  (getConnection [_ _user _password]
    (throw (UnsupportedOperationException. "Use (.getConnection this) instead.")))

  Object
  (equals [_ another]
    (and (instance? DataSource another)
         (= (.url ^DataSource another) url)
         (= (.properties ^DataSource another) properties))))

(alter-meta! #'->DataSource assoc :private true)

(defn raw-connection-string->DataSource
  "Return a [[javax.sql.DataSource]] given a raw JDBC connection string."
  ^javax.sql.DataSource [connection-string]
  {:pre [(string? connection-string)]}
  (->DataSource
   (cond->> connection-string
     (not (str/starts-with? connection-string "jdbc:")) (str "jdbc:"))
   nil))

(defn broken-out-details->DataSource
  "Return a [[javax.sql.DataSource]] given a broken-out Metabase connection details."
  ^javax.sql.DataSource [db-type details]
  {:pre [(keyword? db-type) (map? details)]}
  (let [{:keys [subprotocol subname], :as spec} (db.spec/spec db-type (set/rename-keys details {:dbname :db}))
        _                                       (assert subprotocol)
        _                                       (assert subname)
        url                                     (format "jdbc:%s:%s" subprotocol subname)
        properties                              (some-> (not-empty (dissoc spec :classname :subprotocol :subname))
                                                        pool/map->properties)]
    (->DataSource url properties)))
