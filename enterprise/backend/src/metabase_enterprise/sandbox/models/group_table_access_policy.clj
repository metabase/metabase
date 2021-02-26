(ns metabase-enterprise.sandbox.models.group-table-access-policy
  "Model definition for Group Table Access Policy, aka GTAP. A GTAP is useed to control access to a certain Table for a
  certain PermissionsGroup. Whenever a member of that group attempts to query the Table in question, a Saved Question
  specified by the GTAP is instead used as the source of the query."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.mbql.normalize :as normalize]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.interface :as i]
            [metabase.models.table :as table]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.server.middleware.session :as session]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel GroupTableAccessPolicy :group_table_access_policy)

(defn- normalize-attribute-remapping-targets [attribute-remappings]
  (m/map-vals
   normalize/normalize
   attribute-remappings))

;; for GTAPs
(models/add-type! ::attribute-remappings
  :in  (comp i/json-in normalize-attribute-remapping-targets)
  :out (comp normalize-attribute-remapping-targets i/json-out-without-keywordization))

(defn table-field-names->cols
  "Return a mapping of field names to corresponding cols for given table."
  [table-id]
  (classloader/require 'metabase.query-processor)
  (into {} (for [col (session/with-current-user nil
                       ((resolve 'metabase.query-processor/query->expected-cols)
                        {:database (table/table-id->database-id table-id)
                         :type     :query
                         :query    {:source-table table-id}}))]
             [(:name col) col])))

(defn check-column-types-match
  "Assert that the base type of `col`, returned by a GTAP source query, matches the base type of `table-col`, a column
  from the original Table being sandboxed."
  {:arglists '([col table-col])}
  [col {table-col-base-type :base_type}]
  ;; These errors might get triggered by API endpoints or by the QP (this code is used in the
  ;; `row-level-restrictions` middleware). So include `:type` and `:status-code` information in the ExceptionInfo
  ;; data so it can be passed along if applicable.
  (when table-col-base-type
    (when-not (isa? (keyword (:base_type col)) table-col-base-type)
      (let [msg (tru "Sandbox Questions can''t return columns that have different types than the Table they are sandboxing.")]
        (throw (ex-info msg
                        {:type        qp.error-type/bad-configuration
                         :status-code 400
                         :message     msg
                         :new-col     col
                         :expected    table-col-base-type
                         :actual      (:base_type col)}))))))

(s/defn check-columns-match-table
  "Make sure the result metadata data columns for the Card associated with a GTAP match up with the columns in the Table
  that's getting GTAPped. It's ok to remove columns, but you cannot add new columns. The base types of the Card
  columns can derive from the respective base types of the columns in the Table itself, but you cannot return an
  entirely different type."
  ([{card-id :card_id, table-id :table_id}]
   ;; not all GTAPs have Cards
   (when card-id
     ;; not all Cards have saved result metadata
     (when-let [result-metadata (db/select-one-field :result_metadata Card :id card-id)]
       (check-columns-match-table table-id result-metadata))))

  ([table-id :- su/IntGreaterThanZero result-metadata-columns]
   ;; prevent circular refs
   (classloader/require 'metabase.query-processor)
   (let [table-cols (table-field-names->cols table-id)]
     (doseq [col  result-metadata-columns
             :let [table-col (get table-cols (:name col))]]
       (check-column-types-match col table-col)))))

;; TODO -- should we only check these constraints if EE features are enabled??
(defn update-card-check-gtaps
  "If a Card is updated, and its result metadata changes, check that these changes do not violate the constraints placed
  on GTAPs (the Card cannot add fields or change types vs. the original Table)."
  [{new-result-metadata :result_metadata, card-id :id}]
  (when new-result-metadata
    (when-let [gtaps-using-this-card (not-empty (db/select [GroupTableAccessPolicy :id :table_id] :card_id card-id))]
      (let [original-result-metadata (db/select-one-field :result_metadata Card :id card-id)]
        (when-not (= original-result-metadata new-result-metadata)
          (doseq [{gtap-id :id, table-id :table_id} gtaps-using-this-card]
            (try
              (check-columns-match-table table-id new-result-metadata)
              (catch clojure.lang.ExceptionInfo e
                (throw (ex-info (str (tru "Cannot update Card: Card is used for Sandboxing, and updates would violate sandbox rules.")
                                     " "
                                     (.getMessage e))
                                (ex-data e)
                                e))))))))))

(log/trace "Installing additional EE pre-update checks for Card")
(reset! card/pre-update-check-sandbox-constraints update-card-check-gtaps)

(defn- pre-insert [gtap]
  (u/prog1 gtap
    (check-columns-match-table gtap)))

(defn- pre-update [{:keys [id], :as updates}]
  (u/prog1 updates
    (let [original (GroupTableAccessPolicy id)
          updated  (merge original updates)]
      (when-not (= (:table_id original) (:table_id updated))
        (throw (ex-info (tru "You cannot change the Table ID of a GTAP once it has been created.")
                        {:id          id
                         :status-code 400})))
      (when (:card_id updates)
        (check-columns-match-table updated)))))

(u/strict-extend (class GroupTableAccessPolicy)
  models/IModel
  (merge
   models/IModelDefaults
   {:types      (constantly {:attribute_remappings ::attribute-remappings})
    :pre-insert pre-insert
    :pre-update pre-update})

  ;; only admins can work with GTAPs
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:can-read?  i/superuser?
    :can-write? i/superuser?}))
