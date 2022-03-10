(ns metabase.db.liquibase.h2
  "Custom implementation of the Liquibase H2 adapter that uppercases all identifiers. See #20611 for more details."
  (:require [metabase.util :as u])
  (:import liquibase.database.core.H2Database
           liquibase.database.jvm.JdbcConnection))

(defn- upcase ^String [s]
  (some-> s u/upper-case-en))

(defn- h2-database* ^H2Database []
  (proxy [H2Database] []
    (quoteObject [object-name object-type]
      (let [^H2Database this this]
        (proxy-super quoteObject (upcase object-name) object-type)))

    (mustQuoteObjectName [_object-name _object-type]
      true)))

(defn h2-database
  "A version of the Liquibase H2 implementation that always converts identifiers to uppercase and then quotes them."
  ^H2Database [^JdbcConnection conn]
  (doto (h2-database*)
    (.setConnection conn)))
