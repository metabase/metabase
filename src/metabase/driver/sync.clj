(ns metabase.driver.sync
  "General functions and utilities for sync operations across multiple drivers."
  (:require [clojure.string :as str])
  (:import java.util.regex.Pattern))

(defn- schema-pattern->re-pattern
  "Converts a schema pattern, as entered in the UI, into regex pattern suitable to be passed into [[re-pattern]].  The
  conversion that happens is from commas into pipes (disjunction), and wildcard characters (`*`) into greedy wildcard
  matchers (`.*`).  These only occur if those characters are not preceded by a backslash, which serves as an escape
  character for purposes of this conversion.

  Examples:
    a,b => a|b
    test* => test.*
    foo*,*bar => foo.*|.*bar
    crazy\\*schema => crazy\\*schema"
  ^Pattern [schema-pattern]
  (re-pattern (-> (str/replace schema-pattern #"(^|[^\\\\])\*" "$1.*")
                  (str/replace #"(^|[^\\\\])," "$1|"))))

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

      true
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
  [prop-nm {db-details :details :as database}]
  (let [schema-filter-type     (get db-details (keyword (str prop-nm "-type")))
        schema-filter-patterns (get db-details (keyword (str prop-nm "-patterns")))
        exclusion-type?        (= "exclusion" schema-filter-type)]
    (if exclusion-type?
      [nil schema-filter-patterns]
      [schema-filter-patterns nil])))
