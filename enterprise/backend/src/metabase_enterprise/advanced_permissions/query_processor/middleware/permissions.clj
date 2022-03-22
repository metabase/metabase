(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.models.query.permissions :as query-perms]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.util.i18n :refer [tru]]))

(def ^:private max-rows-in-limited-downloads 10000)

(defn- is-download?
  "Returns true if this query is being used to generate a CSV/JSON/XLSX export."
  [query]
  (some-> query :info :context name (str/includes? "download")))

(defn- tables->download-perms-set
  [database-or-id tables-or-ids value]
  (query-perms/tables->permissions-path-set
   database-or-id
   tables-or-ids
   {:table-perms-fn (fn [& path-components] (apply perms/feature-perms-path :download value path-components))
    :native-perms-fn (fn [db-id] (perms/native-feature-perms-path :download value db-id))}))

(defn- download-perms-set
  "Returns a set of permissions that are required to download a given query."
  [{query-type :type, database :database, :as query} value]
  (cond
    (empty? query)         #{}
    (= query-type :native) #{(perms/native-feature-perms-path :download value database)}
    (= query-type :query)  (tables->download-perms-set database (query-perms/query->source-table-ids query) value)))

(defn- current-user-download-perms-level
  [query]
  (cond
    (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set* (download-perms-set query :full))
    :full

    (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set* (download-perms-set query :limited))
    :limited

    :else
    :none))

(defn apply-download-limit
  "Pre-processing middleware to apply row limits to MBQL export queries if the user has `limited` download perms. This
  does not apply to native queries, which are instead limited by the [[limit-download-result-rows]] post-processing
  middleware."
  [{query-type :type, {original-limit :limit} :query, :as query}]
  (if (and (is-download? query)
           (premium-features/has-feature? :advanced-permissions)
           (= query-type :query)
           (= (current-user-download-perms-level query) :limited))
    (assoc-in query [:query :limit] (reduce min
                                            (filter some? [original-limit max-rows-in-limited-downloads])))
    query))

(defn limit-download-result-rows
  "Post-processing middleware to limit the number of rows included in downloads if the user has `limited` download
  perms. Mainly useful for native queries, which are not modified by the [[apply-download-limit]] pre-processing
  middleware."
  [query rff]
  (if (and (is-download? query)
           (premium-features/has-feature? :advanced-permissions)
           (= (current-user-download-perms-level query) :limited))
    (fn limit-download-result-rows* [metadata]
      ((take max-rows-in-limited-downloads) (rff metadata)))
    rff))

(defn check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  [qp]
  (fn [query rff context]
    (when (premium-features/has-feature? :advanced-permissions)
      (let [download-perms-level (if api/*current-user-id*
                                   (current-user-download-perms-level query)
                                   ;; If no user is bound, assume full download permissions (e.g. for public questions))
                                   :full)]
        (when (and (is-download? query)
                   (= download-perms-level :none))
          (throw (qp.perms/perms-exception (tru "You do not have permissions to download the results of this query")
                                           (set/union (download-perms-set query :full)
                                                      (download-perms-set query :limited)))))
        (qp query
            (fn [metadata] (rff (some-> metadata (assoc :download_perms download-perms-level))))
            context)))
    (qp query rff context)))
