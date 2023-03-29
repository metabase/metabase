(ns metabase.query-processor.middleware.upgrade-field-literals
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.middleware.resolve-fields
    :as qp.resolve-fields]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(defn- has-a-native-source-query-at-some-level? [{:keys [source-query]}]
  (or (:native source-query)
      (when source-query
        (has-a-native-source-query-at-some-level? source-query))))

(defn- warn-once
  "Log only one warning per QP run (regardless of message)."
  [message]
  ;; Make sure QP store is available since we use caching below (it may not be in some unit tests)
  (when (qp.store/initialized?)
    ;; by caching the block below, the warning will only get trigger a maximum of one time per query run. We don't need
    ;; to blow up the logs with a million warnings.
    (qp.store/cached ::bad-clause-warning
      (log/warn (u/colorize :red message)))))

(defn- fix-clause [{:keys [inner-query source-aliases field-name->field]} [_ field-name options :as field-clause]]
  ;; attempt to find a corresponding Field ref from the source metadata.
  (let [field-ref (:field_ref (get field-name->field field-name))]
    (cond
      field-ref
      (mbql.u/match-one field-ref
        ;; If the matching Field ref is an integer `:field` clause then replace it with the corrected clause and log
        ;; a developer-facing warning. Things will still work and this should be fixed on the FE, but we don't need to
        ;; blow up prod logs
        [:field (id :guard integer?) new-options]
        (u/prog1 [:field id (merge new-options (dissoc options :base-type))]
          (when (and (not config/is-prod?)
                     (not (has-a-native-source-query-at-some-level? inner-query)))
            ;; don't i18n this because it's developer-facing only.
            (warn-once
             (str "Warning: query is using a [:field <string> ...] clause to refer to a Field in an MBQL source query."
                  \newline
                  "Use [:field <integer> ...] clauses to refer to Fields in MBQL source queries."
                  \newline
                  "We will attempt to fix this, but it may lead to incorrect queries."
                  \newline
                  "See #19757 for more information."
                  \newline
                  (str "Clause:       " (pr-str field-clause))
                  \newline
                  (str "Corrected to: " (pr-str <>))))))

        ;; Otherwise the Field clause in the source query uses a string Field name as well, but that name differs from
        ;; the one in `source-aliases`. Will this work? Not sure whether or not we need to log something about this.
        [:field (field-name :guard string?) new-options]
        (u/prog1 [:field field-name (merge new-options (dissoc options :base-type))]
          (warn-once
           (trs "Warning: clause {0} does not match a column in the source query. Attempting to correct this to {1}"
                (pr-str field-clause)
                (pr-str <>)))))

      ;; If the field name exists in the ACTUAL names returned by the source query then we're g2g and don't need to
      ;; complain about anything.
      (contains? source-aliases field-name)
      field-clause

      ;; no matching Field ref means there's no column with this name in the source query. The query may not work, so
      ;; log a warning about it. This query is probably not going to work so we should let everyone know why.
      :else
      (do
        (warn-once
         (trs "Warning: clause {0} refers to a Field that may not be present in the source query. Query may not work as expected. Found: {1}"
              (pr-str field-clause) (pr-str (or (not-empty source-aliases)
                                                (set (keys field-name->field))))))
        field-clause))))

(defn- upgrade-field-literals-one-level [{:keys [source-metadata], :as inner-query}]
  (let [source-aliases    (into #{} (keep :source_alias) source-metadata)
        field-name->field (merge (m/index-by :name source-metadata)
                                 (m/index-by (comp u/lower-case-en :name) source-metadata))]
    (mbql.u/replace inner-query
      ;; don't upgrade anything inside `source-query` or `source-metadata`.
      (_ :guard (constantly (some (set &parents) [:source-query :source-metadata])))
      &match

      ;; look for `field` clauses that use a string name that doesn't appear in `source-aliases` (the ACTUAL names that
      ;; are returned by the source query)
      [:field (field-name :guard (every-pred string? (complement source-aliases))) options]
      (or (fix-clause {:inner-query inner-query, :source-aliases source-aliases, :field-name->field field-name->field}
                      &match)
          &match))))

(defn upgrade-field-literals
  "Look for usage of `:field` (name) forms where `field` (ID) would have been the correct thing to use, and fix it, so
  the resulting query doesn't end up being broken."
  [query]
  (-> (walk/postwalk
       (fn [form]
         ;; find maps that have `source-query` and `source-metadata`, but whose source query is an MBQL source query
         ;; rather than an native one
         (if (and (map? form)
                  (:source-query form)
                  (seq (:source-metadata form))
                  ;; we probably shouldn't upgrade things at all if we have a source MBQL query whose source is a native
                  ;; query at ANY level, since `[:field <name>]` might mean `source.<name>` or it might mean
                  ;; `some_join.<name>`. But we'll probably break more things than we fix if turn off this middleware in
                  ;; that case. See #19757 for more info
                  (not (get-in form [:source-query :native])))
           (upgrade-field-literals-one-level form)
           form))
       (qp.resolve-fields/resolve-fields query))
      qp.resolve-fields/resolve-fields))
