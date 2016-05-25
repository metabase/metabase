(ns ^:deprecated metabase.util.korma-extensions
  "Extensions and utility functions for [SQL Korma](http://www.sqlkorma.com/docs)."
  (:refer-clojure :exclude [cast])
  (:require (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            [metabase.util.honeysql-extensions :as hx]))

;;; DB util fns

(defn create-db
  "Like `korma.db/create-db`, but adds a fn to unescape escaped dots when generating SQL."
  [spec]
  (update-in (kdb/create-db spec) [:options :naming :fields] comp hx/unescape-dots))

(defn create-entity
  "Like `korma.db/create-entity`, but takes a sequence of name components instead; escapes dots in names as well."
  [name-components]
  (k/create-entity (apply str (interpose "." (for [s     name-components
                                                   :when (seq s)]
                                               (name (hx/escape-dots (name s))))))))

(defn cast
  "Generate a statement like `CAST(x AS c)`/"
  [c x]
  (kutils/func (format "CAST(%%s AS %s)" (name c))
               [x]))
