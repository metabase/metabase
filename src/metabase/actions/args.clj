(ns ^:instrument/always metabase.actions.args
  (:require
   [medley.core :as m]
   [metabase.actions.db :as actions.db]
   [metabase.actions.hierarchy :as actions.hierarchy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(defmulti action-arg-map-schema
  "Return the appropriate malli schema to use to validate the arg map passed to [[perform-action!*]].

    (action-arg-map-schema :model.row/create) => :actions.args.crud/row.create"
  {:arglists '([action]), :added "0.44.0"}
  keyword
  :hierarchy #'actions.hierarchy/hierarchy)

(defmulti normalize-action-arg-map
  "Normalize the `arg-map` passed to [[perform-action!]] for a specific `action`."
  {:arglists '([action arg-map]), :added "0.44.0"}
  (fn [action _arg-map]
    (keyword action))
  :hierarchy #'actions.hierarchy/hierarchy)

(defmulti validate-inputs!
  "Check whether the given action is supported for the given inputs, and if not throw an error."
  {:arglists '([action inputs]), :added "0.57.0"}
  (fn [action _inputs]
    (keyword action))
  :hierarchy #'actions.hierarchy/hierarchy)

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
  [:map {:closed true} [:database ::lib.schema.id/database]])

(mr/def ::row
  [:map-of :string [:ref ::lib.schema.parameter/parameter.value]])

;;; The primary key of one row: the value of each primary key column, by column name.

(mr/def ::pk
  [:map-of {:min 1} :string [:ref ::lib.schema.parameter/parameter.value.scalar]])

;;; Common base schema for all CRUD model row Actions, which act on one row of a Table. All of them at least require
;;;
;;;    {:database <id>, :table-id <id>}

(mr/def ::model.row.common
  [:merge
   ::common
   [:map [:table-id ::lib.schema.id/table]]])

(defn- normalize-model-row-arg-map
  "String keys for the columns of the `:pk`, `:create-row` and `:update-row` of a `:model.row/*` arg map."
  [arg-map]
  (reduce (fn [arg-map k]
            (m/update-existing arg-map k update-keys u/qualified-name))
          arg-map
          [:pk :create-row :update-row]))

;;;; `:model.row/create`

;;; row/create requires
;;;
;;;    {:database   <id>
;;;     :table-id   <id>
;;;     :create-row <map>}

(mr/def ::model.row.create
  [:merge
   ::model.row.common
   [:map [:create-row ::row]]])

(defmethod action-arg-map-schema :model.row/create
  [_action]
  ::model.row.create)

(defmethod normalize-action-arg-map :model.row/create
  [_action arg-map]
  (normalize-model-row-arg-map arg-map))

;;;; `:model.row/update`

;;; row/update requires
;;;
;;;    {:database   <id>
;;;     :table-id   <id>
;;;     :pk         <map>
;;;     :update-row <map>}

(mr/def ::model.row.update
  [:merge
   ::model.row.common
   [:map
    [:pk         ::pk]
    [:update-row ::row]]])

(defmethod action-arg-map-schema :model.row/update
  [_action]
  ::model.row.update)

(defmethod normalize-action-arg-map :model.row/update
  [_action arg-map]
  (normalize-model-row-arg-map arg-map))

;;;; `:model.row/delete`

;;; row/delete requires
;;;
;;;    {:database <id>
;;;     :table-id <id>
;;;     :pk       <map>}

(mr/def ::model.row.delete
  [:merge
   ::model.row.common
   [:map [:pk ::pk]]])

(defmethod action-arg-map-schema :model.row/delete
  [_action]
  ::model.row.delete)

(defmethod normalize-action-arg-map :model.row/delete
  [_action arg-map]
  (normalize-model-row-arg-map arg-map))

;;;; Table actions

;;; All table Actions require at least
;;;
;;;    {:database <id>, :table-id <id>, :rows [{<key> <value>} ...]}

(mr/def ::table.common
  [:merge
   ::common
   [:map [:table-id pos-int?]
    [:row {:optional true} ::row]
    [:arg {:optional true} ::row]]])

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

(actions.hierarchy/derive! :table.row/create :table.row/common)
(actions.hierarchy/derive! :table.row/update :table.row/common)
(actions.hierarchy/derive! :table.row/delete :table.row/common)

(defmethod action-arg-map-schema :table.row/common
  [_action]
  ::table.common)

(defmethod normalize-action-arg-map :table.row/common
  [_action-kw {:keys [database table-id row] row-arg :arg :as _arg-map}]
  (when (seq row-arg)
    (log/warn ":arg is deprecated, use :row instead"))
  ;; TODO it would be nice to use cached-database-via-table-id here, but need to solve circular dependency.
  {:database (or database (when table-id (actions.db/table-database-id table-id)))
   :table-id table-id
   :row      (update-keys (or row row-arg) u/qualified-name)})

(mr/def ::table.insert
  [:map {:closed true}
   [:database ::lib.schema.id/database]
   [:table-id ::lib.schema.id/table]
   [:values   ::row]])

(mr/def ::data-grid.row.input
  "A data-grid row action input before its normalization resolves the database."
  [:map {:closed true}
   [:table-id ::lib.schema.id/table]
   [:row      ::row]])

(mr/def ::any-arg-map
  "One arg map an action can be invoked with, in any of the shapes [[action-arg-map-schema]] recognizes."
  [:or
   ::model.row.create
   ::model.row.update
   ::model.row.delete
   ::table.common
   ::data-grid.row.input
   ::table.insert
   [:= {} {}]])
