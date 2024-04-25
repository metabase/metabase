(ns metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
  "Middleware that handles special `internal` type queries. `internal` queries are implemented directly by various
  implementations of the [[metabase-enterprise.audit-app.interface/internal-query]] multimethod, and do not necessarily
  need to query a database to provide results; by default, they completely skip the rest of the normal QP pipeline.
  `internal` queries as passed to the Query Processor should look like the following:

    {:type :internal
     :fn   \"metabase-enterprise.audit-app.pages.dashboards/table\"
     :args []} ; optional vector of args to pass to the fn above

  To run an `internal` query, you must have superuser permissions. This middleware will automatically resolve the
  function as appropriate, loading its namespace if needed.

    (defmethod audit.i/internal-query ::table
      [_]
      {:metadata ..., :results ...})

  The function should return a map with two keys, `:metadata` and `:results`, in either the 'legacy' or 'reducible'
  format:

  LEGACY FORMAT:

  *  `:metadata` is a series of [col-name metadata-map] pairs. See [[metabase-enterprise.audit-app.interface/ResultsMetadata]]
  *  `:results` is a series of maps.

    {:metadata [[:title {:display_name \"Title\", :base_type :type/Text}]
                [:count {:display_name \"Count\", :base_type :type/Integer}]]
     :results  [{:title \"Birds\", :count 2}
                {:title \"Cans\", :count 2}]}

  REDUCIBLE FORMAT:

  *  `:metadata` is the same as the legacy format.
  *  `:results` is a thunk that returns something that can be reduced.
  *  `:xform` is an optional xform to apply to each result row while reducing the query

    {:metadata ...
     :results  (fn [] ...)
     :xform    ...}"
  (:require
   [clojure.data :as data]
   [metabase-enterprise.audit-app.interface :as audit.i]
   [metabase.api.common.validation :as validation]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- check-results-and-metadata-keys-match
  "Primarily for dev and debugging purposes. We can probably take this out when shipping the finished product."
  [results metadata]
  (let [results-keys  (set (keys (first results)))
        metadata-keys (set (map (comp keyword first) metadata))]
    (when (and (seq results-keys)
               (not= results-keys metadata-keys))
      (let [[only-in-results only-in-metadata] (data/diff results-keys metadata-keys)]
        (throw
         (Exception.
          (str "results-keys and metadata-keys differ.\n"
               "results-keys: " results-keys "\n"
               "metadata-keys: " metadata-keys "\n"
               "in results, but not metadata: " only-in-results "\n"
               "in metadata, but not results: " only-in-metadata)))))))

(defn- metadata->cols [metadata]
  (for [[k v] metadata]
    (assoc v :name (name k))))

(mu/defn ^:private format-results [{:keys [results metadata]} :- [:map
                                                                  [:results  [:sequential :map]]
                                                                  [:metadata audit.i/ResultsMetadata]]]
  (check-results-and-metadata-keys-match results metadata)
  {:cols (metadata->cols metadata)
   :rows (for [row results]
           (for [[k] metadata]
             (get row (keyword k))))})

(def InternalQuery
  "Schema for a valid `internal` type query."
  [:map
   [:type [:enum :internal "internal"]]
   [:fn   [:and
           :string
           [:fn
            {:error/message "namespace-qualified symbol serialized as a string"}
            (fn [s]
              (try
                (when-let [symb (symbol s)]
                  (qualified-symbol? symb))
                (catch Throwable _)))]]]
   [:args {:optional true} [:sequential :any]]])

(def ^:dynamic *additional-query-params*
  "Additional `internal` query params beyond `type`, `fn`, and `args`. These are bound to this dynamic var which is a
  chance to do something clever outside of the normal function args. For example audit app uses `limit` and `offset`
  to implement paging for all audit app queries automatically."
  nil)

(defn- reduce-reducible-results [rff {:keys [metadata results xform], :or {xform identity}}]
  (let [cols           (metadata->cols metadata)
        reducible-rows (results)
        rff*           (fn [metadata]
                         (xform (rff metadata)))]
    (assert (some? cols))
    (assert (instance? clojure.lang.IReduceInit reducible-rows))
    (qp.pipeline/*reduce* rff* {:cols cols} reducible-rows)))

(defn- reduce-legacy-results [rff results]
  (let [{:keys [cols rows]} (format-results results)]
    (assert (some? cols))
    (assert (some? rows))
    (qp.pipeline/*reduce* rff {:cols cols} rows)))

(defn- reduce-results [rff {rows :results, :as results}]
  ((if (fn? rows)
     reduce-reducible-results
     reduce-legacy-results) rff results))

(mu/defn ^:private process-internal-query
  [{qualified-fn-str :fn, args :args, :as query} :- InternalQuery
   rff                                           :- ::qp.schema/rff]
  ;; Make sure current user is a superuser or has monitoring permissions
  (validation/check-has-application-permission :monitoring)
  ;; Make sure audit app is enabled (currently the only use case for internal queries). We can figure out a way to
  ;; allow non-audit-app queries if and when we add some
  (when-not (premium-features/enable-audit-app?)
    (throw (ex-info (tru "Audit App queries are not enabled on this instance.")
                    {:type qp.error-type/invalid-query})))
  (binding [*additional-query-params* (dissoc query :fn :args)]
    (let [resolved (apply audit.i/resolve-internal-query qualified-fn-str args)]
      (reduce-results rff resolved))))

(defenterprise handle-audit-app-internal-queries
  "Middleware that handles `:internal` (Audit App) type queries."
  :feature :audit-app
  [qp]
  (fn [query rff]
    (if (qp.util/internal-query? query)
      (process-internal-query query rff)
      (qp query rff))))
