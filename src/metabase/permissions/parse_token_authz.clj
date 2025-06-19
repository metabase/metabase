(ns metabase.permissions.parse-token-authz
  "Parses json claims from a token in the form
  ```json
  {
    resources: [
      {
        dashboard: 1,
        drill: ['underlying-records', 'quick-filter-drill']
        params: {
          customer: [user_id]
        }
      },
      {
        dashboard: 2,
      }
    ],
    data_access: [
      {
        database: 'sales'
        blocked_tables: [
          'public.reviews'
        ],
      },
      {
        database: 'invoices'
        create_queries: 'query_builder'
        allowed_tables: [
          'public.customers',
          'public.invoices'
        ]
      }
    ],
  };

  into the Permissions Doc expected for permission policy evaluation
  ```
  "
  (:require
   [clojure.string :as str]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   [java.util Base64]))

(defn- parse-table-name
  "Parses a table name like 'public.customers' into schema and table parts"
  [table-name]
  (let [parts (str/split table-name #"\.")]
    (if (= 2 (count parts))
      {:schema (first parts) :table (second parts)}
      {:schema nil :table table-name})))

(defn- process-data-access-entry
  "Processes a single data access entry and returns database permissions"
  [entry]
  (let [database (get entry "database")
        create-queries (get entry "create_queries")
        view-data (get entry "view_data")
        download-results (get entry "download_results")
        blocked-tables (get entry "blocked_tables" [])
        allowed-tables (get entry "allowed_tables" [])]

    {(t2/select-one-pk [:model/Database] :name database)
     (cond-> {:database-name database}
       ;; Database-level permissions
       create-queries (assoc :perms/create-queries (keyword create-queries))
       view-data (assoc :perms/view-data (keyword view-data))
       download-results (assoc :perms/download-results (keyword download-results))

       ;; Table-level permissions
       (seq blocked-tables)
       (assoc :tables
              (into {} (map (fn [table-name]
                              (let [{:keys [schema table]} (parse-table-name table-name)]
                                ;; Use a simple hash of the table name as ID for now
                                [(t2/select-one-pk [:model/Table] :name table :schema schema)
                                 {:perms/view-data :blocked
                                  :table-name table
                                  :schema schema}]))
                            blocked-tables)))

       (seq allowed-tables)
       (update :tables
               (fn [tables]
                 (merge tables
                        (into {} (map (fn [table-name]
                                        (let [{:keys [schema table]} (parse-table-name table-name)]
                                          [(t2/select-one-pk [:model/Table] :name table :schema schema)
                                           {:perms/view-data :unrestricted
                                            :perms/create-queries (or (keyword create-queries) :query-builder)
                                            :perms/download-results (or (keyword download-results) :one-million-rows)
                                            :table-name table
                                            :schema schema}]))
                                      allowed-tables))))))}))

(defn- process-resource-entry
  "Processes a single resource entry and returns resource permissions"
  [entry]
  (let [dashboard-id (get entry "dashboard")
        collection-id (get entry "collection")
        drill (get entry "drill")
        params (get entry "params")]

    (cond-> {}
      dashboard-id
      (assoc-in [:dashboards dashboard-id]
                (cond-> {:perms/dashboard-access :read}
                  drill (assoc :drills (if (sequential? drill)
                                         (set (map keyword drill))
                                         #{(keyword drill)}))
                  params (assoc :params (into {} (map (fn [[k v]]
                                                        [(keyword k) v])
                                                      params)))))

      collection-id
      (assoc-in [:collections collection-id]
                {:perms/collection-access :read}))))

(defn ->permissions-doc
  "Converts a JSON token authorization document into a permissions document format.

  Args:
    token-authz - A map representing the parsed JSON token with 'resources' and 'data_access' keys

  Returns:
    A permissions document in the format expected by metabase.permissions.policy"
  [token-authz]
  (let [resources (get token-authz "resources" [])
        data-access (get token-authz "data_access" [])]

    (merge
     ;; Process resources (dashboards, collections, etc.)
     (reduce (fn [acc entry]
               (let [processed (process-resource-entry entry)]
                 (merge-with merge acc processed)))
             {}
             resources)

     ;; Process data access (databases and tables)
     {:databases
      (reduce (fn [acc entry]
                (let [database (get entry "database")
                      processed (process-data-access-entry entry)]
                  (if database
                    (merge acc processed)
                    acc)))
              {}
              data-access)})))

(defn parse-from-base64
  "Accepts the json document as a URLSafe base64 string and parses it into a permissions document"
  [encoded-json]
  (try
    (let [decoder (Base64/getUrlDecoder)
          decoded-bytes (.decode decoder encoded-json)
          json-string #p (String. decoded-bytes "UTF-8")
          token-authz (json/decode json-string)]
      (->permissions-doc token-authz))
    (catch Exception e
      (throw (ex-info "Failed to parse base64 encoded JSON token"
                      {:encoded-json encoded-json
                       :error (.getMessage e)}
                      e)))))

(defn parse-from-request
  [{{:strs [authz-token]} :query-params}]
  (prn authz-token)
  (when authz-token
    (parse-from-base64 authz-token)))
