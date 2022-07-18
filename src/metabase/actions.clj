(ns metabase.actions
  "Code related to the new writeback Actions."
  (:require
   [clojure.spec.alpha :as s]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.database :refer [Database]]
   [metabase.models.setting :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [schema.core :as schema]))

(setting/defsetting experimental-enable-actions
  (i18n/deferred-tru "Whether to enable using the new experimental Actions features globally. (Actions must also be enabled for each Database.)")
  :default false
  :type :boolean
  :visibility :public)

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable using the new experimental Actions for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only)

(defn +check-actions-enabled
  "Ring middleware that checks that the [[metabase.actions/experimental-enable-actions]] feature flag is enabled, and
  returns a 403 Unauthorized response "
  [handler]
  (fn [request respond raise]
    (if (experimental-enable-actions)
      (handler request respond raise)
      (raise (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400})))))

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

(defn perform-action!
  "Perform an `action`. Invoke this function for performing actions, e.g. in API endpoints;
  implement [[perform-action!*]] to add support for a new driver/action combo. The shape of `arg-map` depends on the
  `action` being performed. [[action-arg-map-spec]] returns the specific spec used to validate `arg-map` for a given
  `action`."
  [action arg-map]
  ;; Validate the arg map.
  (let [action  (keyword action)
        spec    (action-arg-map-spec action)
        arg-map (normalize-action-arg-map action arg-map)]
    (when (s/invalid? (s/conform spec arg-map))
      (throw (ex-info (format "Invalid Action arg map for %s: %s" action (s/explain-str spec arg-map))
                      (s/explain-data spec arg-map))))
    ;; Check that Actions are enabled globally.
    (when-not (experimental-enable-actions)
      (throw (ex-info (i18n/tru "Actions are not enabled.")
                      {:status-code 400})))
    ;; Check that Actions are enabled for this specific Database.
    (let [{database-id :database}                         arg-map
          {db-settings :settings, driver :engine, :as db} (api/check-404 (Database database-id))]
      ;; make sure the Driver supports Actions.
      (when-not (driver/database-supports? driver :actions db)
        (throw (ex-info (i18n/tru "{0} Database {1} does not support actions."
                                  (u/qualified-name driver)
                                  (format "%d %s" (:id db) (pr-str (:name db))))
                        {:status-code 400, :database-id (:id db)})))
      ;; bind Database-local Settings for this Database
      (binding [setting/*database-local-values* db-settings]
        ;; make sure Actions are enabled for this Database
        (when-not (database-enable-actions)
          (throw (ex-info (i18n/tru "Actions are not enabled for Database {0}." database-id)
                          {:status-code 400})))
        ;; TODO -- need to check permissions once we have Actions-specific perms in place. For now just make sure the
        ;; current User is an admin. This check is only done if [[api/*current-user*]] is bound (which will always be
        ;; the case when invoked from an API endpoint) to make Actions testable separately from the API endpoints.
        (when api/*current-user*
          (api/check-superuser))
        ;; Ok, now we can hand off to [[perform-action!*]]
        (perform-action!* driver action db arg-map)))))

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

;;; the various `:row/*` Actions all treat their args map as an MBQL query.

(defn- normalize-as-mbql-query
  "Normalize `query` as an MBQL query. Optional arg `:exclude` is a set of *normalized* keys to exclude from recursive
  normalization, e.g. `:create-row` for the `:row/create` Action (we don't want to normalize the row input since
  preserving case and `snake_keys` in the request body is important)."
  ([query]
   (let [query (mbql.normalize/normalize (assoc query :type :query))]
     (try
       (schema/validate mbql.s/Query query)
       (catch Exception e
         (throw (ex-info
                 (ex-message e)
                 {:exception-data (ex-data e)
                  :status-code    400}))))
     query))

  ([query & {:keys [exclude]}]
   (let [query (update-keys query mbql.u/normalize-token)]
     (merge (select-keys query exclude)
            (normalize-as-mbql-query (apply dissoc query exclude))))))

;;;; `:row/create`

;;; row/create requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :create-row <map>}

(defmethod normalize-action-arg-map :row/create
  [_action query]
  (normalize-as-mbql-query query :exclude #{:create-row}))

(s/def :actions.args.crud.row.create/create-row
  (s/map-of keyword? any?))

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
  (normalize-as-mbql-query query :exclude #{:update-row}))

(s/def :actions.args.crud.row.update.query/filter
  vector?) ; MBQL filter clause

(s/def :actions.args.crud.row.update/query
  (s/merge
   :actions.args.crud.row.common/query
   (s/keys :req-un [:actions.args.crud.row.update.query/filter])))

(s/def :actions.args.crud.row.update/update-row
  (s/map-of keyword? any?))

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
  (normalize-as-mbql-query query))

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
;;;    {:database <id>, :table-id <id>}

(s/def :actions.args.crud.bulk.common/table-id
  :actions.args/id)

(s/def :actions.args.crud.bulk/common
  (s/merge
   :actions.args/common
   (s/keys :req-un [:actions.args.crud.bulk.common/table-id])))

;;; this is used by several of the bulk actions but not necessarily required.
(s/def :actions.args.crud.bulk/rows
  (s/cat :rows (s/+ (s/map-of keyword? any?))))

;;;; `:bulk/create`

;;; For `bulk/create` the request body is to `POST /api/action/:action-namespace/:action-name/:table-id` is just a
;;; vector of rows but the API endpoint itself calls [[perform-action!]] with
;;;
;;;    {:database <database-id>, :table-id <table-id>, :arg <request-body>}
;;;
;;; and we transform this to
;;;
;;;     {:database <database-id>, :table-id <table-id>, :rows <request-body>}

(defmethod normalize-action-arg-map :bulk/create
  [_action {:keys [database table-id], rows :arg, :as _arg-map}]
  {:database database, :table-id table-id, :rows rows})

(s/def :actions.args.crud.bulk/create
  (s/merge
   :actions.args.crud.bulk/common
   (s/keys :req-un [:actions.args.crud.bulk/rows])))

(defmethod action-arg-map-spec :bulk/create
  [_action]
  :actions.args.crud.bulk/create)

;;;; `:bulk/delete`

;;; For `bulk/delete` the request body is to `POST /api/action/:action-namespace/:action-name/:table-id` is just a
;;; vector of rows but the API endpoint itself calls [[perform-action!]] with
;;;
;;;    {:database <database-id>, :table-id <table-id>, :arg <request-body>}
;;;
;;; and we transform this to
;;;
;;;     {:database <database-id>, :table-id <table-id>, :pk-value-maps <request-body>}
;;;
;;; Request-body should look like:
;;;
;;;    ;; single pk, two rows
;;;    [{"ID": 76},
;;;     {"ID": 77}]
;;;
;;;    ;; multiple pks, one row
;;;    [{"PK1": 1, "PK2": "john"}]

(defmethod normalize-action-arg-map :bulk/delete
  [_action {:keys [database table-id], pk-value-maps :arg, :as _arg-map}]
  {:database database, :table-id table-id, :pk-value-maps (map #(m/map-keys name %) pk-value-maps)})

(s/def :actions.args.crud.bulk.delete/pk-value-maps
  (s/coll-of (s/map-of string? any?)))

(s/def :actions.args.crud.bulk/delete
  (s/merge
    :actions.args.crud.bulk/common
    (s/keys :req-un [:actions.args.crud.bulk.delete/pk-value-maps])))

(defmethod action-arg-map-spec :bulk/delete
  [_action]
  :actions.args.crud.bulk/delete)

;;;; `:bulk/update`

;; `:bulk/update` has the exact same request shape and transform behavior as `:bulk/create` so go read that if you're
;; wondering how it's supposed to look.

(defmethod normalize-action-arg-map :bulk/update
  [_action {:keys [database table-id], rows :arg}]
  {:database database, :table-id table-id, :rows rows})

(s/def :actions.args.crud.bulk/update
  (s/merge
   :actions.args.crud.bulk/common
   (s/keys :req-un [:actions.args.crud.bulk/rows])))

(defmethod action-arg-map-spec :bulk/update
  [_action]
  :actions.args.crud.bulk/update)
