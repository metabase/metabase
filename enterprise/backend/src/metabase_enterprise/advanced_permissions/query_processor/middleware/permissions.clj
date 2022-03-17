(ns metabase-enterprise.advanced-permissions.query-processor.middleware.permissions
  (:require [clojure.string :as str]
            [clojure.set :as set]
            [metabase.api.common :as api]
            [metabase.models.permissions :as perms]
            [metabase.models.query.permissions :as query-perms]
            [metabase.util.i18n :refer [tru]]
            [metabase.query-processor.middleware.permissions :as qp.perms]))

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
           (= query-type :query)
           (= (current-user-download-perms-level query) :limited))
    (assoc-in query [:query :limit] (min original-limit max-rows-in-limited-downloads))
    query))

(defn check-download-permissions
  "Middleware for queries that generate downloads, which checks that the user has permissions to download the results
  of the query, and aborts the query or limits the number of results if necessary.

  If this query is not run to generate an export (e.g. :export-format is :api) we return user's download permissions in
  the query metadata so that the frontend can determine whether to show the download option on the UI."
  [qp]
  (fn [query rff context]
    (let [download-perms-level (current-user-download-perms-level query)]
      (when (and (is-download? query)
                 (= download-perms-level :none))
        (throw (qp.perms/perms-exception (tru "You do not have permissions to download the results of this query")
                                         (set/union (download-perms-set query :full)
                                                    (download-perms-set query :limited))))))
    (qp query rff context)))
