(ns metabase.driver.sync
  "General functions and utilities for sync operations across multiple drivers."
  (:require
   [clojure.string :as str])
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
            pattern    (schema-pattern->re-pattern (if inclusion? inclusion-patterns exclusion-patterns))]
        (fn [s]
          (let [m        (.matcher pattern s)
                matches? (.matches m)]
            (if inclusion? matches? (not matches?))))))))

(def ^:private schema-patterns->filter-fn (memoize schema-patterns->filter-fn*))

(defn include-schema?
  "Returns true of the given `schema-name` should be included/synced, considering the given `inclusion-patterns` and
  `exclusion-patterns`. Patterns are comma-separated, and can contain wildcard characters (`*`)."
  {:added "0.42.0"}
  [inclusion-patterns exclusion-patterns schema-name]
  (let [filter-fn (schema-patterns->filter-fn inclusion-patterns exclusion-patterns)]
    (filter-fn schema-name)))

(defn db-details->schema-filter-patterns
  "Given a `prop-nm` (which is expected to be a connection property of type `:schema-filters`), and a `database`
  instance, return a vector containing [inclusion-patterns exclusion-patterns]."
  {:added "0.42.0"}
  [prop-nm {db-details :details :as _database}]
  (let [schema-filter-type     (get db-details (keyword (str prop-nm "-type")))
        schema-filter-patterns (get db-details (keyword (str prop-nm "-patterns")))]
    (case schema-filter-type
      "exclusion" [nil schema-filter-patterns]
      "inclusion" [schema-filter-patterns nil]
      [nil nil])))
