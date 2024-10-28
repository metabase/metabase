(ns metabase.util.version
  "Utilities for version comparison and database version checking."
  (:require [metabase.lib.schema.common :as lib.schema.common]
            [metabase.util.log :as log]
            [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn semantic-version-gte :- :boolean
  "Returns true if xv is greater than or equal to yv according to semantic versioning.
   xv and yv are sequences of integers of the form `[major minor ...]`, where only
   major is obligatory.
   Examples:
   (semantic-version-gte [4 1] [4 1]) => true
   (semantic-version-gte [4 0 1] [4 1]) => false
   (semantic-version-gte [4 1] [4]) => true
   (semantic-version-gte [3 1] [4]) => false"
  [xv :- [:maybe [:sequential ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   yv :- [:maybe [:sequential ::lib.schema.common/int-greater-than-or-equal-to-zero]]]
  (loop [xv (seq xv), yv (seq yv)]
    (or (nil? yv)
        (let [[x & xs] xv
              [y & ys] yv
              x (if (nil? x) 0 x)
              y (if (nil? y) 0 y)]
          (or (> x y)
              (and (>= x y) (recur xs ys)))))))

(mu/defn get-db-version
  "Get database version information from JDBC connection metadata."
  [^java.sql.Connection conn]
  (let [metadata (.getMetaData conn)]
    {:flavor           (.getDatabaseProductName metadata)
     :version          (.getDatabaseProductVersion metadata)
     :semantic-version [(.getDatabaseMajorVersion metadata)
                       (.getDatabaseMinorVersion metadata)]}))

(mu/defn check-min-version
  "Check if the database version meets minimum requirements."
  [db-type version-info min-version]
  (when (and min-version
             (not= db-type :h2))  ; Skip version check for H2
    (let [{:keys [flavor semantic-version]} version-info]
      (when-not (semantic-version-gte semantic-version min-version)
        (let [version-error-msg (format "%s version %d.%d is below the required version %d.%d."
                                      flavor
                                      (first semantic-version)
                                      (second semantic-version)
                                      (first min-version)
                                      (second min-version))]
          (log/error version-error-msg)
          (throw (ex-info version-error-msg {:current-version semantic-version
                                           :required-version min-version})))))))
