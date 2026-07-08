(ns ^:instrument/always metabase.actions.args
  (:require
   ;; legacy usage, do not use this in new code
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defmulti action-arg-map-schema
  "Return the appropriate malli schema to use to validate the arg map passed to [[perform-action!*]].

    (action-arg-map-schema :model.row/create) => :actions.args.crud/row.create"
  {:arglists '([action]), :added "0.44.0"}
  keyword)

(defmulti normalize-action-arg-map
  "Normalize the `arg-map` passed to [[perform-action!]] for a specific `action`."
  {:arglists '([action arg-map]), :added "0.44.0"}
  (fn [action _arg-map]
    (keyword action)))

(defmulti validate-inputs!
  "Check whether the given action is supported for the given inputs, and if not throw an error."
  {:arglists '([action inputs]), :added "0.57.0"}
  (fn [action _inputs]
    (keyword action)))

(defmethod normalize-action-arg-map :default
  [_action arg-map]
  arg-map)

(defmethod action-arg-map-schema :default
  [_action]
  :any)

(defmethod validate-inputs! :default
  [_action _inputs])

;;;; Action definitions.

;;; Common base schema for *all* Actions. All Actions at least require
;;;
;;;    {:database <id>}
;;;
;;; Anything else required depends on the action type.

(mr/def ::common
  [:map [:database ::lib.schema.id/database]])

(mr/def ::row [:map-of :string :any])

;;; Common base schema for all CRUD model row Actions. All CRUD model row Actions at least require
;;;
;;;    {:database <id>, :query {:source-table <id>}}

(mr/def ::query
  [:map [:source-table ::lib.schema.id/table]])

(mr/def ::crud.row.common
  [:merge
   ::common
   [:map [:query ::query]]])

;;;; `:model.row/create`

;;; row/create requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :create-row <map>}

(mr/def ::model.row.create
  [:merge
   ::crud.row.common
   [:map [:create-row ::row]]])

(defmethod action-arg-map-schema :model.row/create
  [_action]
  ::model.row.create)

(defmethod normalize-action-arg-map :model.row/create
  [_action query]
  (mbql.normalize/normalize-or-throw query))

;;;; `:model.row/update`

;;; row/update requires at least
;;;
;;;    {:database   <id>
;;;     :query      {:source-table <id>, :filter <mbql-filter-clause>}
;;;     :update-row <map>}

(mr/def ::model.row.update
  [:merge
   ::crud.row.common
   [:map [:update-row ::row]
    [:query [:merge
             ::query
             [:map [:filter [:sequential :any]]]]]]])

(defmethod action-arg-map-schema :model.row/update
  [_action]
  ::model.row.update)

(defmethod normalize-action-arg-map :model.row/update
  [_action query]
  (mbql.normalize/normalize-or-throw query))

;;;; `:model.row/delete`

;;; row/delete requires at least
;;;
;;;    {:database <id>
;;;     :query    {:source-table <id>, :filter <mbql-filter-clause>}}

(mr/def ::model.row.delete
  [:merge
   ::crud.row.common
   [:map [:query [:merge
                  ::query
                  [:map [:filter [:sequential :any]]]]]]])

(defmethod action-arg-map-schema :model.row/delete
  [_action]
  ::model.row.delete)

(defmethod normalize-action-arg-map :model.row/delete
  [_action query]
  (mbql.normalize/normalize-or-throw query))

;;;; Table actions

;;; All table Actions require at least
;;;
;;;    {:database <id>, :table-id <id>, :rows [{<key> <value>} ...]}

(mr/def ::table.common
  [:merge
   ::common
   [:map [:table-id pos-int?]
    [:row ::row]]])

;;; The request bodies for the table CRUD actions are all the same. The body of a request to `POST
;;; /api/action/:action-namespace/:action-name/:table-id` is just a vector of rows but the API endpoint itself calls
;;; [[perform-action!]] with
;;;
;;;    {:database <database-id>, :table-id <table-id>, :row <request-body>}
;;;
;;; and we transform this to
;;;
;;;     {:database <database-id>, :table-id <table-id>, :rows <request-body>}

;;;; `:table.row/create`, `:table.row/delete`, `:table.row/update` -- these all have the exact same shapes

(derive :table.row/create :table.row/common)
(derive :table.row/update :table.row/common)
(derive :table.row/delete :table.row/common)

(defmethod action-arg-map-schema :table.row/common
  [_action]
  ::table.common)

(defmethod normalize-action-arg-map :table.row/common
  [_action-kw {:keys [database table-id row] row-arg :arg :as _arg-map}]
  (when (seq row-arg)
    (log/warn ":arg is deprecated, use :row instead"))
  ;; TODO it would be nice to use cached-database-via-table-id here, but need to solve circular dependency.
  {:database (or database (when table-id (t2/select-one-fn :db_id [:model/Table :db_id] table-id)))
   :table-id table-id
   :row      (update-keys (or row row-arg) u/qualified-name)})
