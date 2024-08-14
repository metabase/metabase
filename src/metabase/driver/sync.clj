(ns metabase.driver.sync
  "General functions and utilities for sync operations across multiple drivers."
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u])
  (:import
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(defn- schema-pattern->re-pattern
  "Converts a schema pattern, as entered in the UI, into regex pattern suitable to be passed into [[re-pattern]].  The
  conversion that happens is from commas into pipes (disjunction), and wildcard characters (`*`) into greedy wildcard
  matchers (`.*`).  These only occur if those characters are not preceded by a backslash, which serves as an escape
  character for purposes of this conversion.  Any whitespace before and after commas is trimmed.

  Examples:
    a,b => a|b
    test* => test.*
    foo*,*bar => foo.*|.*bar
    foo  ,  ba*r  , baz => foo|ba.*r|baz
    crazy\\*schema => crazy\\*schema"
  ^Pattern [^String schema-pattern]
  (re-pattern (->> (str/split schema-pattern #",")
                   (map (comp #(str/replace % #"(^|[^\\\\])\*" "$1.*") str/trim))
                   (str/join "|"))))

(defn- schema-patterns->filter-fn*
  [inclusion-patterns exclusion-patterns]
  (let [inclusion-blank? (str/blank? inclusion-patterns)
        exclusion-blank? (str/blank? exclusion-patterns)]
    (cond
      (and inclusion-blank? exclusion-blank?)
      (constantly true)

      (and (not inclusion-blank?) (not exclusion-blank?))
      (throw (ex-info "Inclusion and exclusion patterns cannot both be specified"
                      {::inclusion-patterns inclusion-patterns
                       ::exclusion-patterns exclusion-patterns}))

      :else
      (let [inclusion? exclusion-blank?
            pattern    (schema-pattern->re-pattern (if inclusion? inclusion-patterns exclusion-patterns))
            match-fn   (fn match-fn [^String s]
                         (when s
                           (let [m (.matcher pattern s)]
                             (.matches m))))]
        ;; for inclusion patterns, never match a `nil` schema; for exclusion patterns, always consider a `nil` schema to
        ;; be ok
        (if inclusion?
          match-fn
          (complement match-fn))))))

(def ^:private schema-patterns->filter-fn (memoize schema-patterns->filter-fn*))

(defn db-details->schema-filter-patterns
  "Given an optional `prop-nm` (which is expected to be a connection property of type `:schema-filters`), and a `database`
  instance, return a vector containing [inclusion-patterns exclusion-patterns]."
  {:added "0.42.0"}
  ([database]
   (let [{prop-name :name} (driver.u/find-schema-filters-prop (driver.u/database->driver database))]
     (db-details->schema-filter-patterns prop-name database)))
  ([prop-nm {db-details :details :as _database}]
   (when prop-nm
     (let [schema-filter-type     (get db-details (keyword (str prop-nm "-type")))
           schema-filter-patterns (get db-details (keyword (str prop-nm "-patterns")))]
       (case schema-filter-type
         "exclusion" [nil schema-filter-patterns]
         "inclusion" [schema-filter-patterns nil]
         [nil nil])))))

(defn include-schema?
  "Returns true if the given `schema-name` should be included/synced, considering the given `inclusion-patterns` and
  `exclusion-patterns` (either provided explicitly or taken from the driver's connection properties). Patterns are
  comma-separated, and can contain wildcard characters (`*`)."
  {:added "0.42.0"}
  ([database schema-name]
   (let [[inclusion-patterns exclusion-patterns] (db-details->schema-filter-patterns database)]
     (include-schema? inclusion-patterns exclusion-patterns schema-name)))
  ([inclusion-patterns exclusion-patterns schema-name]
   (let [filter-fn (schema-patterns->filter-fn inclusion-patterns exclusion-patterns)]
     (filter-fn schema-name))))
