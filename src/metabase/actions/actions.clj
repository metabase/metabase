(ns metabase.actions.actions
  "Code related to the new writeback Actions."
  (:require
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.setting :as setting]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable Actions for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only)

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether to enable table data editing for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only
  :export? true)

(defmulti normalize-action-arg-map
  "Normalize the `arg-map` passed to [[perform-action!]] for a specific `action`."
  {:arglists '([action arg-map]), :added "0.44.0"}
  (fn [action _arg-map]
    (keyword action)))

(defmethod normalize-action-arg-map :default
  [_action arg-map]
  arg-map)

(defmulti action-arg-map-spec
  "Return the appropriate spec to use to validate the arg map passed to [[perform-action!*]].

    (action-arg-map-spec :row/create) => :actions.args.crud/row.create"
  {:arglists '([action]), :added "0.44.0"}
  keyword)

(defmethod action-arg-map-spec :default
  [_action]
  any?)

(defmulti perform-action!*
  "Multimethod for doing an Action. The specific `action` is a keyword like `:row/create` or `:bulk/create`; the shape
  of `arg-map` depends on the action being performed. [[action-arg-map-spec]] returns the appropriate spec to use to
  validate the args for a given action. When implementing a new action type, be sure to implement both this method
  and [[action-arg-map-spec]].

  At the time of this writing Actions are performed with either `POST /api/action/:action-namespace/:action-name`,
  which passes in the request body as `args-map` directly, or `POST
  /api/action/:action-namespace/:action-name/:table-id`, which passes in an `args-map` like

    {:table-id <table-id>, :arg <request-body>}

  The former endpoint is currently used for the various `:row/*` Actions while the version with `:table-id` as part of
  the route is currently used for `:bulk/*` Actions.

  DON'T CALL THIS METHOD DIRECTLY TO PERFORM ACTIONS -- use [[perform-action!]] instead which does normalization,
  validation, and binds Database-local values."
  {:arglists '([driver action database arg-map]), :added "0.44.0"}
  (fn [driver action _database _arg-map]
    [(driver/dispatch-on-initialized-driver driver)
     (keyword action)])
  :hierarchy #'driver/hierarchy)

(defn- known-actions
  "Set of all known actions."
  []
  (into #{}
        (comp (filter sequential?)
              (map second))
        (keys (methods perform-action!*))))

(defmethod perform-action!* :default
  [driver action _database _arg-map]
  (let [action        (keyword action)
        known-actions (known-actions)]
    ;; return 404 if the action doesn't exist.
    (when-not (contains? known-actions action)
      (throw (ex-info (i18n/tru "Unknown Action {0}. Valid Actions are: {1}"
                                action
                                (pr-str known-actions))
                      {:status-code 404})))
    ;; return 400 if the action does exist but is not supported by this DB
    (throw (ex-info (i18n/tru "Action {0} is not supported for {1} Databases."
                              action
                              (pr-str driver))
                    {:status-code 400}))))

(def ^:dynamic *misc-value-cache*
  "A cache that lives for the duration of the top-level Action invoked by [[perform-action!]]. You can use this to store
  miscellaneous values such as things that need to be fetched from the application database to avoid duplicate calls
  in bulk actions that repeatedly call code that would only be called once by single-row Actions. Bound to an atom
  containing a map by [[perform-action!]]."
  nil)

(defn cached-value
  "Get a cached value from the [[*misc-value-cache*]] using a `unique-key` if it already exists. If it does not exist,
  calculate the value using `value-thunk`, cache it, then return it.

  `unique-key` must be unique app-wide. Something like

    [::cast-values table-id]

  is a good key."
  [unique-key value-thunk]
  (or (when *misc-value-cache*
        (get @*misc-value-cache* unique-key))
      (let [value (value-thunk)]
        (when *misc-value-cache*
          (swap! *misc-value-cache* assoc unique-key value))
        value)))

(defn check-actions-enabled-for-database!
  "Throws an appropriate error if actions are unsupported or disabled for a database, otherwise returns nil."
  [{db-settings :settings db-id :id driver :engine db-name :name :as db}]
  (when-not (driver.u/supports? driver :actions db)
    (throw (ex-info (i18n/tru "{0} Database {1} does not support actions."
                              (u/qualified-name driver)
                              (format "%d %s" db-id (pr-str db-name)))
                    {:status-code 400, :database-id db-id})))

  (binding [setting/*database-local-values* db-settings]
    (when-not (database-enable-actions)
      (throw (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400, :database-id db-id}))))

  nil)

(defn check-data-editing-enabled-for-database!
  "Throws an appropriate error if editing is unsupported or disabled for a database, otherwise returns nil."
  [{db-settings :settings db-id :id driver :engine db-name :name :as db}]
  ;; for now we reuse the :actions driver feature, but specialise the message
  (when-not (driver.u/supports? driver :actions db)
    (throw (ex-info (i18n/tru "{0} Database {1} does not support data editing."
                              (u/qualified-name driver)
                              (format "%d %s" db-id (pr-str db-name)))
                    {:status-code 400, :database-id db-id})))

  (binding [setting/*database-local-values* db-settings]
    (when-not (database-enable-table-editing)
      (throw (ex-info (i18n/tru "Data editing is not enabled.")
                      {:status-code 400, :database-id db-id}))))

  nil)

(defn- database-for-action [action-or-id]
  (t2/select-one :model/Database {:select [:db.*]
                                  :from   :action
                                  :join   [[:report_card :card] [:= :card.id :action.model_id]
                                           [:metabase_database :db] [:= :db.id :card.database_id]]
                                  :where  [:= :action.id (u/the-id action-or-id)]}))

(defn check-actions-enabled!
  "Throws an appropriate error if actions are unsupported or disabled for the database of the action's model,
   otherwise returns nil."
  [action-or-id]
  (check-actions-enabled-for-database! (api/check-404 (database-for-action action-or-id))))

(mu/defn perform-action!
  "Perform an `action`. Invoke this function for performing actions, e.g. in API endpoints;
  implement [[perform-action!*]] to add support for a new driver/action combo. The shape of `arg-map` depends on the
  `action` being performed. [[action-arg-map-spec]] returns the specific spec used to validate `arg-map` for a given
  `action`."
  [action
   arg-map
   & {:keys [policy]
      :or   {policy :model-action}}]
  (let [action  (keyword action)
        spec    (action-arg-map-spec action)
        arg-map (normalize-action-arg-map action arg-map)] ; is arg-map always just a regular query?
    (when (s/invalid? (s/conform spec arg-map))
      (throw (ex-info (format "Invalid Action arg map for %s: %s" action (s/explain-str spec arg-map))
                      (s/explain-data spec arg-map))))
    (let [{driver :engine :as db} (api/check-404 (qp.store/with-metadata-provider (:database arg-map)
                                                   (lib.metadata/database (qp.store/metadata-provider))))]
      (case policy
        :model-action
        (check-actions-enabled-for-database! db)
        :data-editing
        (check-data-editing-enabled-for-database! db))
      (binding [*misc-value-cache* (atom {})]
        (when (= :model-action policy)
          (qp.perms/check-query-action-permissions* arg-map))
        (driver/with-driver driver
          (perform-action!* driver action db arg-map))))))

(defn- publish-action-invocation! [invocation-id user-id action-kw args-map]
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :args          args-map}
       (events/publish-event! :event/action.invoked)))

(defn publish-action-success!
  "Publish an action success event. This is a success event for the action that was invoked."
  [invocation-id user-id action-kw args-map result]
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :result        result
        :args          (u/snake-keys args-map)}
       (events/publish-event! :event/action.success)))

(defn- publish-action-failure! [invocation-id user-id action-kw msg info]
  (->> {:action        action-kw
        :invocation_id invocation-id
        :actor_id      user-id
        :error         (:error info)
        :message       msg
        :info          info}
       (events/publish-event! :event/action.failure)))

(defn- qp-result->row-map
  [{:keys [rows cols]}]
  ;; rows from the request are keywordized
  (let [col-names (map (comp keyword :name) cols)]
    (map #(zipmap col-names %) rows)))

(defn- table-id->pk
  [table-id]
  ;; TODO: support composite PKs
  (let [pks (api/check-404 (t2/select :model/Field :table_id table-id :semantic_type :type/PK))]
    (api/check-500 (= 1 (count pks)))
    (first pks)))

(defn- get-row-pk
  [pk-field row]
  (get row (keyword (:name pk-field))))

(defn- query-db-rows
  "Given a table ID and a primary key field, return a map of rows from the database with the primary key as the key."
  [table-id pk-field rows]
  (let [{:keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))]
    (assert pk-field "Table must have a primary key")
    (when-let [pk-values (seq (map (partial get-row-pk pk-field) rows))]
      (qp.store/with-metadata-provider db_id
        (let [mp    (qp.store/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp table-id))
                        (lib/filter (apply lib/in (lib.metadata/field mp (:id pk-field)) pk-values))
                        qp/userland-query-with-default-constraints)]
          (->> (qp/process-query query)
               :data
               qp-result->row-map
               (m/index-by #(get-row-pk pk-field %))))))))

(defn perform-with-system-events!
  "Eventually, all calls to perform-action! should go through this... Proceeding with caution."
  [action-kw args-map & {:as opts}]
  (let [table-id          (:table-id args-map) ;; TODO not all argmap has table-id
        pk-field          (when table-id (table-id->pk table-id))
        rows              (:arg args-map) ;; TODO: this is not always the argmap
        pk->db-row-before (query-db-rows table-id pk-field rows)
        invocation-id     (nano-id/nano-id)
        user-id           api/*current-user-id*]
    ;; TODO: we'll need to get these fields more generically
    (assert (and table-id pk-field (seq rows)))
    (publish-action-invocation! invocation-id user-id action-kw args-map)
    (try
      (let [result           (perform-action! action-kw args-map opts)
            pk->db-row-after (case action-kw
                               (:bulk/update :bulk/delete)
                               (query-db-rows table-id pk-field rows)
                               :bulk/create
                               (into {} (for [row (:created-rows result)]
                                          [(get-row-pk pk-field row) (update-keys row keyword)])))
            all-pks          (set/union (set (keys pk->db-row-before))
                                        (set (keys pk->db-row-after)))
            row-changes      (for [pk all-pks
                                   :let [before (get pk->db-row-before pk)
                                         after (get pk->db-row-after pk)]
                                   :when (not= before after)]
                               {:pk     pk
                                :before before
                                :after  after})]
        (publish-action-success! invocation-id user-id action-kw args-map row-changes)
        result)
      (catch Exception e
        (let [msg  (ex-message e)
              info (ex-data e)
              info (with-meta info (merge (meta info) {:exception e}))]
          (publish-action-failure! invocation-id user-id action-kw msg info)
          (throw e))))))

;;;; Action definitions.

;;; Common base spec for *all* Actions. All Actions at least require
;;;
;;;    {:database <id>}
;;;
;;; Anything else required depends on the action type.

(s/def :actions.args/id
  (s/and integer? pos?))

(s/def :actions.args.common/database
  :actions.args/id)

(s/def :actions.args/common
  (s/keys :req-un [:actions.args.common/database]))

;;; Common base spec for all CRUD row Actions. All CRUD row Actions at least require
;;;
;;;    {:database <id>, :query {:source-table <id>}}

(s/def :actions.args.crud.row.common.query/source-table
  :actions.args/id)

(s/def :actions.args.crud.row.common/query
  (s/keys :req-un [:actions.args.crud.row.common.query/source-table]))

(s/def :actions.args.crud.row/common
  (s/merge
   :actions.args/common
   (s/keys :req-un [:actions.args.crud.row.common/query])))

;;;; `:row/create`

;;; row/create requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :create-row <map>}

(defmethod normalize-action-arg-map :row/create
  [_action query]
  (mbql.normalize/normalize-or-throw query))

(s/def :actions.args.crud.row.create/create-row
  (s/map-of string? any?))

(s/def :actions.args.crud/row.create
  (s/merge
   :actions.args.crud.row/common
   (s/keys :req-un [:actions.args.crud.row.create/create-row])))

(defmethod action-arg-map-spec :row/create
  [_action]
  :actions.args.crud/row.create)

;;;; `:row/update`

;;; row/update requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :update-row <map>}

(defmethod normalize-action-arg-map :row/update
  [_action query]
  (mbql.normalize/normalize-or-throw query))

(s/def :actions.args.crud.row.update.query/filter
  vector?) ; MBQL filter clause

(s/def :actions.args.crud.row.update/query
  (s/merge
   :actions.args.crud.row.common/query
   (s/keys :req-un [:actions.args.crud.row.update.query/filter])))

(s/def :actions.args.crud.row.update/update-row
  (s/map-of string? any?))

(s/def :actions.args.crud/row.update
  (s/merge
   :actions.args.crud.row/common
   (s/keys :req-un [:actions.args.crud.row.update/update-row
                    :actions.args.crud.row.update/query])))

(defmethod action-arg-map-spec :row/update
  [_action]
  :actions.args.crud/row.update)

;;;; `:row/delete`

;;; row/delete requires at least
;;;
;;;    {:database <id>
;;;     :query    {:source-table <id>, :filter <mbql-filter-clause>}}

(defmethod normalize-action-arg-map :row/delete
  [_action query]
  (mbql.normalize/normalize-or-throw query))

(s/def :actions.args.crud.row.delete.query/filter
  vector?) ; MBQL filter clause

(s/def :actions.args.crud.row.delete/query
  (s/merge
   :actions.args.crud.row.common/query
   (s/keys :req-un [:actions.args.crud.row.delete.query/filter])))

(s/def :actions.args.crud/row.delete
  (s/merge
   :actions.args.crud.row/common
   (s/keys :req-un [:actions.args.crud.row.delete/query])))

(defmethod action-arg-map-spec :row/delete
  [_action]
  :actions.args.crud/row.delete)

;;;; Bulk actions

;;; All bulk Actions require at least
;;;
;;;    {:database <id>, :table-id <id>, :rows [{<key> <value>} ...]}

(s/def :actions.args.crud.bulk.common/table-id
  :actions.args/id)

(s/def :actions.args.crud.bulk/rows
  (s/cat :rows (s/+ (s/map-of string? any?))))

(s/def :actions.args.crud.bulk/common
  (s/merge
   :actions.args/common
   (s/keys :req-un [:actions.args.crud.bulk.common/table-id
                    :actions.args.crud.bulk/rows])))

;;; The request bodies for the bulk CRUD actions are all the same. The body of a request to `POST
;;; /api/action/:action-namespace/:action-name/:table-id` is just a vector of rows but the API endpoint itself calls
;;; [[perform-action!]] with
;;;
;;;    {:database <database-id>, :table-id <table-id>, :arg <request-body>}
;;;
;;; and we transform this to
;;;
;;;     {:database <database-id>, :table-id <table-id>, :rows <request-body>}

;;;; `:bulk/create`, `:bulk/delete`, `:bulk/update` -- these all have the exact same shapes

(defn- normalize-bulk-crud-action-arg-map
  [{:keys [database table-id], rows :arg, :as _arg-map}]
  {:type :query, :query {:source-table table-id}
   :database database, :table-id table-id, :rows (map #(update-keys % u/qualified-name) rows)})

(defmethod normalize-action-arg-map :bulk/create
  [_action arg-map]
  (normalize-bulk-crud-action-arg-map arg-map))

(defmethod action-arg-map-spec :bulk/create
  [_action]
  :actions.args.crud.bulk/common)

(defmethod normalize-action-arg-map :bulk/update
  [_action arg-map]
  (normalize-bulk-crud-action-arg-map arg-map))

(defmethod action-arg-map-spec :bulk/update
  [_action]
  :actions.args.crud.bulk/common)

;;;; `:bulk/delete`

;;; Request-body should look like:
;;;
;;;    ;; single pk, two rows
;;;    [{"ID": 76},
;;;     {"ID": 77}]
;;;
;;;    ;; multiple pks, one row
;;;    [{"PK1": 1, "PK2": "john"}]

(defmethod normalize-action-arg-map :bulk/delete
  [_action arg-map]
  (normalize-bulk-crud-action-arg-map arg-map))

(defmethod action-arg-map-spec :bulk/delete
  [_action]
  :actions.args.crud.bulk/common)
