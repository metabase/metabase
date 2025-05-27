(ns metabase.actions.actions
  "Code related to the new writeback Actions."
  (:require
   [clojure.spec.alpha :as s]
   [metabase.actions.events :as actions.events]
   [metabase.actions.scope :as actions.scope]
   [metabase.actions.settings :as actions.settings]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.store :as qp.store]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2])
  (:import (clojure.lang ExceptionInfo)))

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

    (action-arg-map-spec :model.row/create) => :actions.args.crud/row.create"
  {:arglists '([action]), :added "0.44.0"}
  keyword)

(defmethod action-arg-map-spec :default
  [_action]
  any?)

(defmulti perform-action!*
  "Multimethod for doing an Action. The specific `action` is a keyword like `:model.row/create` or `:table.row/create`; the shape
  of each input depends on the action being performed. [[action-arg-map-spec]] returns the appropriate spec to use to
  validate the inputs for a given action. When implementing a new action type, be sure to implement both this method
  and [[action-arg-map-spec]].

  DON'T CALL THIS METHOD DIRECTLY TO PERFORM ACTIONS -- use [[perform-action!]] instead which does normalization,
  validation, and binds Database-local values."
  {:arglists '([action context inputs]), :added "0.44.0"}
  (fn [action {:keys [driver]} _inputs]
    [(if driver
       (driver/dispatch-on-initialized-driver driver)
       ;; For now, all actions have this as the lowest common denominator, and use it even where the db is irrelevant.
       :sql-jdbc)
     (keyword action)])
  :hierarchy #'driver/hierarchy)

(defn- known-implicit-actions
  "Set of all known legacy actions."
  []
  (into #{}
        (comp (filter sequential?)
              (map second))
        (keys (methods perform-action!*))))

(defmethod perform-action!* :default
  [action context _inputs]
  (let [action        (keyword action)
        driver        (:engine context)
        known-actions (known-implicit-actions)]
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

  (setting/with-database-local-values db-settings
    (when-not (actions.settings/database-enable-actions)
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

  (setting/with-database-local-values db-settings
    (when-not (actions.settings/database-enable-table-editing)
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

(defmulti handle-effects!*
  "Trigger bulk side effects in response to individual effects within actions, e.g. table row modified system events."
  {:arglists '([effect-type context payloads]), :added "internal-tools"}
  (fn [effect-type _context _payloads]
    (keyword effect-type)))

(defn- handle-effects! [{:keys [effects] :as context}]
  (let [sans-effects (dissoc context :effects)]
    (doseq [[event-type payloads] (u/group-by first second effects)]
      (handle-effects!* event-type sans-effects payloads))))

(mu/defn- perform-action-internal!
  [action-kw :- qualified-keyword?
   ctx       :- :map
   ;; Since the inner map shape will depend on action-kw, we will need to dynamically validate it.
   inputs    :- [:sequential :map]
   & {:as _opts}]
  (let [invocation-id  (nano-id/nano-id)
        context-before (-> (assoc ctx :invocation-id invocation-id)
                           (update :invocation-stack u/conjv [action-kw invocation-id]))]
    (actions.events/publish-action-invocation! action-kw context-before inputs)
    (try
      (u/prog1 (perform-action!* action-kw context-before inputs)
        (let [{context-after :context, :keys [outputs]} <>]
          (doseq [k [:invocation-id :invocation-stack :user-id]]
            (assert (= (k context-before) (k context-after)) (format "Output context must not change %s" k)))
          ;; We might in future want effects to propagate all the up to the root scope ¯\_(ツ)_/¯
          (handle-effects! context-after)
          (actions.events/publish-action-success! action-kw context-after outputs)))
      ;; Err on the side of visibility. We may want to handle Errors differently when we polish Internal Tools.
      (catch Throwable e
        (let [msg  (ex-message e)
              ;; Can't be nil or adding metadata will NPE
              info (or (ex-data e) {})
              ;; TODO Why metadata? Not sure anything is reading this, and it'll get lost if we serialize error events.
              info (with-meta info (merge (meta info) {:exception e}))]
          ;; Need to think about how we learn about already performed effects this way, since we don't get a context.
          (actions.events/publish-action-failure! action-kw context-before msg info)
          (throw e))))))

(defn perform-nested-action!
  "Similar to [[perform-action!]] but taking an existing context.
   Assumes (for now) that the schemas have been checked and args coerced, etc. Also doesn't do perms checks yet.
   Use this if you want to explicitly call an action from within an action and have it traced in the audit log etc."
  [action-kw context inputs]
  ;; For now, we are handling effects whenever we "pop" an action, but in future we may want them to propagate.
  ;; The rationale for this is that it would allow us batch things more atomically (e.g., for notifications)
  {:context context #_(update context :effects into (:effects context-after))
   :outputs (:outputs (perform-action-internal! action-kw context inputs))})

(defn cached-database
  "Uses cache to prevent redundant look-ups with an action call chain."
  [db-id]
  (assert db-id "Id cannot be nil")
  (cached-value [:databases db-id]
                #(qp.store/with-metadata-provider db-id
                   (lib.metadata/database (qp.store/metadata-provider)))))

(defn cached-database-via-table-id
  "Uses cache to prevent redundant look-ups with an action call chain."
  [table-id]
  (assert table-id "Id cannot be nil")
  (cached-database (:db_id (cached-value [:tables table-id] #(t2/select-one [:model/Table :db_id] table-id)))))

(mu/defn perform-action!
  "Perform an *implicit* `action`. Invoke this function for performing actions, e.g. in API endpoints;
  implement [[perform-action!*]] to add support for a new driver/action combo. The shape of `arg-map` depends on the
  `action` being performed. [[action-arg-map-spec]] returns the specific spec used to validate `arg-map` for a given
  `action`."
  [action
   scope
   arg-map-or-maps
   & {:keys [policy existing-context user-id]}]
  (when (and existing-context user-id)
    (assert (= user-id (:user-id existing-context)) "Existing context has a consistent user-id"))
  (let [action-kw (keyword action)
        scope     (actions.scope/hydrate-scope scope)
        arg-maps  (if (map? arg-map-or-maps) [arg-map-or-maps] arg-map-or-maps)
        policy    (or policy
                      (cond
                        (:model-id scope)                        :model-action
                        (= "data-grid" (namespace action-kw))    :data-editing
                        (= "data-editing" (namespace action-kw)) :data-editing
                        :else                                    :ad-hoc-invocation))
        spec      (action-arg-map-spec action-kw)
        arg-maps  (map (partial normalize-action-arg-map action-kw) arg-maps)
        errors    (for [arg-map arg-maps
                        :when (s/invalid? (s/conform spec arg-map))]
                    {:message (format "Invalid Action arg map for %s: %s" action-kw (s/explain-str spec arg-map))
                     :data    (s/explain-data spec arg-map)})
        _         (when (seq errors)
                    (throw (ex-info (str "Invalid Action arg map(s) for " action-kw)
                                    {::schema-errors errors})))
        dbs       (or (seq (map (comp api/check-404 cached-database) (distinct (keep :database arg-maps))))
                      ;; for data-grid actions that use their scope, rather than arguments
                      ;; TODO it probably makes more sense for the actions themselves to perform the permissions checks
                      (some-> scope :database-id cached-database vector))
        _         (when (> (count dbs) 1)
                    (throw (ex-info (tru "Cannot operate on multiple databases, it would not be atomic.")
                                    {:status-code  400
                                     :database-ids (map :id dbs)})))
        db        (first dbs)
        driver    (:engine db)]

    ;; -- * Authorization* --
    ;; NOTE: policy should get subsumed by :scope
    ;; The action might not be database-centric (e.g., call a webhook)
    (when db
      (case policy
        :ad-hoc-invocation
        (check-actions-enabled-for-database! db)
        :model-action
        (check-actions-enabled-for-database! db)
        :data-editing
        (check-data-editing-enabled-for-database! db)))

    (binding [*misc-value-cache* (atom {:databases (zipmap (map :id dbs) dbs)})]
      (when (= :model-action policy)
        (doseq [arg-map arg-maps]
          (qp.perms/check-query-action-permissions* arg-map)))
      (when (= :ad-hoc-invocation policy)
        (doseq [arg-map arg-maps]
          (cond
            (:query arg-map) (qp.perms/check-query-action-permissions* arg-map)
            (:table-id arg-map) (qp.perms/check-query-action-permissions*
                                 {:type :query,
                                  :database (:database arg-map)
                                  :query {:source-table (:table-id arg-map)}}))))

      (let [result (let [context (-> existing-context
                                     ;; TODO fix tons of tests which execute without user scope
                                     (u/assoc-default :user-id (identity #_api/check-500
                                                                (or user-id api/*current-user-id*)))
                                     (u/assoc-default :scope scope))]
                     (if-not driver
                       (perform-action-internal! action-kw context arg-maps)
                       (driver/with-driver driver
                         (let [context (assoc context
                                              ;; Legacy drivers dispatch on this, for now.
                                              ;; TODO As far as I'm aware we only have :sql-jdbc defined actions, so can stop dispatching
                                              ;;      on this and just fail if the dynamically determined driver is incompatible.
                                              :driver driver)]
                           (perform-action-internal! action-kw context arg-maps)))))]
        {:effects (:effects (:context result))
         :outputs (:outputs result)}))))

(mu/defn perform-action-with-single-input-and-output
  "This is the Old School version of [[perform-action!], before we returned effects and used bulk chaining."
  [action arg-map & {:keys [scope] :as opts}]
  (try (let [scope             (or scope {:unknown :legacy-action})
             {:keys [outputs]} (perform-action! action scope [arg-map] (dissoc opts :scope))]
         (assert (= 1 (count outputs)) "The legacy action APIs do not support multiple outputs")
         (first outputs))
       (catch ExceptionInfo e
         (if-let [{:keys [message data]} (first (::schema-errors (ex-data e)))]
           (throw (ex-info message data))
           (throw e)))))

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

;;; Common base spec for all CRUD model row Actions. All CRUD model row Actions at least require
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

;;;; `:model.row/create`

;;; row/create requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :create-row <map>}

(defmethod normalize-action-arg-map :model.row/create
  [_action query]
  (mbql.normalize/normalize-or-throw query))

(s/def :actions.args.crud.row.create/create-row
  (s/map-of string? any?))

(s/def :actions.args.crud/row.create
  (s/merge
   :actions.args.crud.row/common
   (s/keys :req-un [:actions.args.crud.row.create/create-row])))

(defmethod action-arg-map-spec :model.row/create
  [_action]
  :actions.args.crud/row.create)

;;;; `:model.row/update`

;;; row/update requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :update-row <map>}

(defmethod normalize-action-arg-map :model.row/update
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

(defmethod action-arg-map-spec :model.row/update
  [_action]
  :actions.args.crud/row.update)

;;;; `:model.row/delete`

;;; row/delete requires at least
;;;
;;;    {:database <id>
;;;     :query    {:source-table <id>, :filter <mbql-filter-clause>}}

(defmethod normalize-action-arg-map :model.row/delete
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

(defmethod action-arg-map-spec :model.row/delete
  [_action]
  :actions.args.crud/row.delete)

;;;; Table actions

;;; All table Actions require at least
;;;
;;;    {:database <id>, :table-id <id>, :rows [{<key> <value>} ...]}

(s/def :actions.args.crud.table.common/table-id
  :actions.args/id)

(s/def :actions.args.crud.table/row
  (s/map-of string? any?))

(s/def :actions.args.crud.table/common
  (s/merge
   :actions.args/common
   (s/keys :req-un [:actions.args.crud.table.common/table-id
                    :actions.args.crud.table/row])))

;;; The request bodies for the table CRUD actions are all the same. The body of a request to `POST
;;; /api/action/:action-namespace/:action-name/:table-id` is just a vector of rows but the API endpoint itself calls
;;; [[perform-action!]] with
;;;
;;;    {:database <database-id>, :table-id <table-id>, :arg <request-body>}
;;;
;;; and we transform this to
;;;
;;;     {:database <database-id>, :table-id <table-id>, :rows <request-body>}

;;;; `:table.row/create`, `:table.row/delete`, `:table.row/update` -- these all have the exact same shapes

(derive :table.row/create :table.row/common)
(derive :table.row/update :table.row/common)
(derive :table.row/delete :table.row/common)

(defmethod action-arg-map-spec :table.row/common
  [_action]
  :actions.args.crud.table/common)

(defmethod normalize-action-arg-map :table.row/common
  [_action {:keys [database table-id row], row-arg :arg, :as _arg-map}]
  {:database (or database (when table-id (:id (cached-database-via-table-id table-id))))
   :table-id table-id
   :row      (update-keys (or row row-arg) u/qualified-name)})
