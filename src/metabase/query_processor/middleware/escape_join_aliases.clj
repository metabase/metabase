(ns metabase.query-processor.middleware.escape-join-aliases
  "Deduplicate and escape join aliases. This is done in a series of discrete steps; see the middleware
  function, [[escape-join-aliases]] for more info.

  Enable trace logging in this namespace for easier debugging:

    (metabase.test/set-ns-log-level! 'metabase.query-processor.middleware.escape-join-aliases :trace)"
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]
   [metabase.util.log :as log]))

;;; this is done in a series of discrete steps

(defn- add-escaped-aliases
  "Walk the query and add an `::escaped-alias` key to every join in the query."
  [query escape-fn]
  (mbql.u/replace query
    (join :guard (every-pred map? :condition :alias (complement ::escaped-alias)))
    (let [join (assoc join ::escaped-alias (escape-fn (:alias join)))]
      ;; now recursively add escaped aliases for `:source-query` etc.
      (add-escaped-aliases join escape-fn))))

(defn- add-original->escaped-alias-maps
  "Walk the query and add a map of original alias -> escaped alias at all levels that also have `:joins`."
  [query]
  (mbql.u/replace query
    (inner-query :guard (every-pred map? :joins (complement ::original->escaped)))
    (let [original->escaped (into {} (map (juxt :alias ::escaped-alias) (:joins inner-query)))
          inner-query      (assoc inner-query ::original->escaped original->escaped)]
      ;; now recursively add `::original->escaped` for source query or joins
      (add-original->escaped-alias-maps inner-query))))

(defn- merge-original->escaped-maps
  "Walk the query and merge the `::original->escaped` maps from nested levels (i.e., source queries or joins) up into
  their parent levels. When duplicate original aliases exist, the one at the top level should 'shadow' ones in nested
  levels."
  [query]
  (mbql.u/replace query
    (m :guard (every-pred map? ::original->escaped))
    ;; first, recursively merge all the stuff in the source levels.
    (let [m'                            (merge-original->escaped-maps (dissoc m ::original->escaped))
          ;; once things are recursively merged we can collect all the ones that are visible to this level into a
          ;; sequence of maps...
          source-original->escaped-maps (mbql.u/match m'
                                          (nested :guard (every-pred map? ::original->escaped))
                                          (::original->escaped nested))
          ;; ...and then merge them together into one merged map. Remember, key at this level should 'shadow' ones in
          ;; the source levels.
          merged-original->escaped      (reduce (fn [m1 m2]
                                                  (merge m2 m1))
                                                (::original->escaped m)
                                                source-original->escaped-maps)]
      (assoc m' ::original->escaped merged-original->escaped))))

(defn- add-escaped-join-aliases-to-fields
  "Walk the query and add an `::escaped-join-alias` to all `:field` clauses."
  [query]
  (mbql.u/replace query
    (m :guard (every-pred map? ::original->escaped))
    (let [original->escaped (::original->escaped m)
          ;; recursively update source levels *first*
          m'                (assoc (add-escaped-join-aliases-to-fields (dissoc m ::original->escaped))
                                   ::original->escaped original->escaped)]
      ;; now update any `:field` clauses that don't have an `::escaped-join-alias`
      (mbql.u/replace m'
        [:field id-or-name (field-options :guard (every-pred map? :join-alias (complement ::escaped-join-alias)))]
        [:field id-or-name (assoc field-options ::escaped-join-alias (get original->escaped (:join-alias field-options)))]))))

(defn- merged-escaped->original-with-no-ops-removed
  "Build a map of escaped alias -> original alias for the query (current level and all nested levels). Remove keys where
  the original alias is identical to the escaped alias; that's not useful information to include in `:info`."
  [query]
  (let [escaped->original-maps (mbql.u/match query
                                 (m :guard (every-pred map? ::original->escaped))
                                 (merge
                                  (set/map-invert (::original->escaped m))
                                  (merged-escaped->original-with-no-ops-removed (dissoc m ::original->escaped))))]
    (not-empty
     (into {}
           (comp cat
                 (remove (fn [[k v]]
                           (= k v))))
           escaped->original-maps))))

(defn- add-escaped->original-info
  "Add a map of escaped alias -> original alias under `[:info :alias/escaped->original]`; this is used
  by [[restore-aliases]] below."
  [query]
  (let [escaped->original (not-empty (merged-escaped->original-with-no-ops-removed query))]
    (cond-> query
      escaped->original (assoc-in [:info :alias/escaped->original] escaped->original))))

(defn- replace-original-aliases-with-escaped-aliases
  "'Commit' all the new escaped aliases we determined we should use to the query, and clean up all the keys we added in
  the process of determining this information.

  * Replace the `:join-alias` in `:field` clauses with the `::escaped-join-alias` and remove `::escaped-join-alias`.

  * Replace the `:alias` in join clauses with the `::escaped-alias` and remove `::escaped-alias`.

  * Remove the `::original->escaped` maps.

  You might be asking, why don't we just do this in the first place rather than adding all these extra keys that we
  eventually remove? For joins, we need to track the original alias for a while to build the `::original->escaped`
  map. For `:field` clauses, we need to keep track of whether we already escaped it or not , since the mapping between
  original alias and escaped alias might be different based on the level of query we're at."
  [query]
  (mbql.u/replace query
    ;; update inner queries that have `::original->escaped` maps
    (m :guard (every-pred map? ::original->escaped))
    (-> (dissoc m ::original->escaped)
        ;; recursively update source levels and `:field` clauses.
        replace-original-aliases-with-escaped-aliases)

    ;; update joins
    (m :guard (every-pred map? ::escaped-alias))
    (-> m
        (assoc :alias (::escaped-alias m))
        (dissoc ::escaped-alias)
        ;; recursively update source levels and `:field` clauses.
        replace-original-aliases-with-escaped-aliases)

    ;; update `:field` clauses
    [:field id-or-name (options :guard (every-pred map? ::escaped-join-alias))]
    [:field id-or-name (-> options
                           (assoc :join-alias (::escaped-join-alias options))
                           (dissoc ::escaped-join-alias))]))

(defn- escape-alias [join-alias]
  (driver/escape-alias driver/*driver* join-alias))

(defn escape-join-aliases
  "Pre-processing middleware. Make sure all join aliases are unique, regardless of case (some databases treat table
  aliases as case-insensitive, even if table names themselves are not); escape all join aliases
  with [[metabase.driver/escape-alias]]. If aliases are 'uniquified', will include a map
  at [:info :alias/escaped->original] of the escaped name back to the original, to be restored in post processing."
  [query]
  (let [escape-fn (comp (mbql.u/unique-name-generator
                         ;; some databases treat aliases as case-insensitive so make sure the generated aliases
                         ;; are unique regardless of case
                         :name-key-fn     u/lower-case-en
                         ;; uniqified aliases needs to be escaped again just in case
                         :unique-alias-fn (fn [original suffix]
                                            (escape-alias (str original \_ suffix))))
                        escape-alias)]
    ;; add logging around the steps to make this easier to debug.
    (log/debugf "Escaping join aliases\n%s" (u/pprint-to-str query))
    (letfn [(add-escaped-aliases* [query]
              (add-escaped-aliases query escape-fn))
            (add-original->escaped-alias-maps* [query]
              (log/tracef "Adding ::escaped-alias to joins\n%s" (u/pprint-to-str query))
              (add-original->escaped-alias-maps query))
            (merge-original->escaped-maps* [query]
              (log/tracef "Adding ::original->escaped alias maps\n%s" (u/pprint-to-str query))
              (merge-original->escaped-maps query))
            (add-escaped-join-aliases-to-fields* [query]
              (log/tracef "Adding ::escaped-join-alias to :field clauses with :join-alias\n%s" (u/pprint-to-str query))
              (add-escaped-join-aliases-to-fields query))
            (add-escaped->original-info* [query]
              (log/tracef "Adding [:info :alias/escaped->original]\n%s" (u/pprint-to-str query))
              (add-escaped->original-info query))
            (replace-original-aliases-with-escaped-aliases* [query]
              (log/tracef "Replacing original aliases with escaped aliases\n%s" query)
              (replace-original-aliases-with-escaped-aliases query))]
      (let [result (-> query
                       add-escaped-aliases*
                       add-original->escaped-alias-maps*
                       merge-original->escaped-maps*
                       add-escaped-join-aliases-to-fields*
                       add-escaped->original-info*
                       replace-original-aliases-with-escaped-aliases*)]
        (log/debugf "=>\n%s" (u/pprint-to-str result))
        result))))

;;; The stuff below is used by the [[metabase.query-processor.middleware.annotate]] middleware when generating results
;;; metadata to restore the escaped aliases back to what they were in the original query so things don't break if you
;;; try to take stuff like the field refs and manipulate the original query with them.

(defn- rename-join-aliases
  "Rename joins in `query` by replacing aliases whose keys appear in `original->new` with their corresponding values."
  [query original->new]
  (let [original->new      (into {} (remove (fn [[original-alias escaped-alias]] (= original-alias escaped-alias))
                                            original->new))
        aliases-to-replace (set (keys original->new))]
    (if (empty? original->new)
      query
      (do
        (log/tracef "Rewriting join aliases:\n%s" (u/pprint-to-str original->new))
        (letfn [(rename-join-aliases* [query]
                  (mbql.u/replace query
                    [:field id-or-name (opts :guard (comp aliases-to-replace :join-alias))]
                    [:field id-or-name (update opts :join-alias original->new)]

                    (join :guard (every-pred map? :condition (comp aliases-to-replace :alias)))
                    (merge
                     ;; recursively update stuff inside the join
                     (rename-join-aliases* (dissoc join :alias))
                     {:alias (original->new (:alias join))})))]
          (rename-join-aliases* query))))))

(defn restore-aliases
  "Restore aliases in query.
  If aliases were changed in [[escape-join-aliases]], there is a key in `:info` of `:alias/escaped->original` which we
  can restore the aliases in the query."
  [query escaped->original]
  (rename-join-aliases query escaped->original))
