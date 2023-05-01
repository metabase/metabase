(ns metabase-enterprise.sandbox.models.group-table-access-policy
  "Model definition for Group Table Access Policy, aka GTAP. A GTAP is useed to control access to a certain Table for a
  certain PermissionsGroup. Whenever a member of that group attempts to query the Table in question, a Saved Question
  specified by the GTAP is instead used as the source of the query.

  See documentation in [[metabase.models.permissions]] for more information about the Metabase permissions system."
  (:require
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.table :as table]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(models/defmodel GroupTableAccessPolicy :sandboxes)

;;; only admins can work with GTAPs
(derive GroupTableAccessPolicy ::mi/read-policy.superuser)
(derive GroupTableAccessPolicy ::mi/write-policy.superuser)

;; This guard is to make sure this file doesn't get compiled twice when building the uberjar -- that will totally
;; screw things up because Toucan models use Potemkin `defrecord+` under the hood.
(when *compile-files*
  (defonce previous-compilation-trace (atom nil))
  (when @previous-compilation-trace
    (log/info "THIS FILE HAS ALREADY BEEN COMPILED!!!!!")
    (log/info "This compilation trace:")
    ((requiring-resolve 'clojure.pprint/pprint) (vec (.getStackTrace (Thread/currentThread))))
    (log/info "Previous compilation trace:")
    ((requiring-resolve 'clojure.pprint/pprint) @previous-compilation-trace)
    (throw (ex-info "THIS FILE HAS ALREADY BEEN COMPILED!!!!!" {})))
  (reset! previous-compilation-trace (vec (.getStackTrace (Thread/currentThread)))))

(defn- normalize-attribute-remapping-targets [attribute-remappings]
  (m/map-vals
   mbql.normalize/normalize
   attribute-remappings))

;; for GTAPs
(models/add-type! ::attribute-remappings
  :in  (comp mi/json-in normalize-attribute-remapping-targets)
  :out (comp normalize-attribute-remapping-targets mi/json-out-without-keywordization))

(defn table-field-names->cols
  "Return a mapping of field names to corresponding cols for given table."
  [table-id]
  (classloader/require 'metabase.query-processor)
  (into {} (for [col (mw.session/with-current-user nil
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
     (when-let [result-metadata (t2/select-one-fn :result_metadata Card :id card-id)]
       (check-columns-match-table table-id result-metadata))))

  ([table-id :- su/IntGreaterThanZero result-metadata-columns]
   ;; prevent circular refs
   (classloader/require 'metabase.query-processor)
   (let [table-cols (table-field-names->cols table-id)]
     (doseq [col  result-metadata-columns
             :let [table-col (get table-cols (:name col))]]
       (check-column-types-match col table-col)))))

(defenterprise pre-update-check-sandbox-constraints
  "If a Card is updated, and its result metadata changes, check that these changes do not violate the constraints placed
  on GTAPs (the Card cannot add fields or change types vs. the original Table)."
  :feature :sandboxes
  [{new-result-metadata :result_metadata, card-id :id}]
  (when new-result-metadata
    (when-let [gtaps-using-this-card (not-empty (t2/select [GroupTableAccessPolicy :id :table_id] :card_id card-id))]
      (let [original-result-metadata (t2/select-one-fn :result_metadata Card :id card-id)]
        (when-not (= original-result-metadata new-result-metadata))))))
a         (doseq [{table-id :table_id} gtaps-using-this-card]
            (try
              (check-columns-match-table table-id new-result-metadata)
              (catch clojure.lang.ExceptionInfo e
                (throw (ex-info (str (tru "Cannot update Card: Card is used for Sandboxing, and updates would violate sandbox rules.")
                                     " "
                                     (.getMessage e))
                                (ex-data e)
                                e)))))

(defenterprise upsert-sandboxes!
  "Create new `sandboxes` or update existing ones. If a sandbox has an `:id` it will be updated, otherwise it will be
  created. New sandboxes must have a `:table_id` corresponding to a sandboxed query path in the `permissions` table;
  if this does not exist, the sandbox will not be created."
  :feature :sandboxes
  [sandboxes]
  (for [sandbox sandboxes]
    (if-let [id (:id sandbox)]
      ;; Only update `card_id` and/or `attribute_remappings` if the values are present in the body of the request.
      ;; This allows existing values to be "cleared" by being set to nil
      (do
        (when (some #(contains? sandbox %) [:card_id :attribute_remappings])
          (t2/update! GroupTableAccessPolicy
                      id
                      (u/select-keys-when sandbox :present #{:card_id :attribute_remappings})))
        (t2/select-one GroupTableAccessPolicy :id id))
      (let [expected-permission-path (perms/table-segmented-query-path (:table_id sandbox))]
        (when-let [permission-path-id (t2/select-one-fn :id Permissions :object expected-permission-path)]
          (first (t2/insert-returning-instances! GroupTableAccessPolicy (assoc sandbox :permission_id permission-path-id))))))))

(defn- pre-insert [gtap]
  (u/prog1 gtap
    (check-columns-match-table gtap)))

(defn- pre-update [{:keys [id], :as updates}]
  (u/prog1 updates
    (let [original (t2/original updates)
          updated  (merge original updates)]
      (when-not (= (:table_id original) (:table_id updated))
        (throw (ex-info (tru "You cannot change the Table ID of a GTAP once it has been created.")
                        {:id          id
                         :status-code 400})))
      (when (:card_id updates)
        (check-columns-match-table updated)))))

(mi/define-methods
 GroupTableAccessPolicy
 {:types      (constantly {:attribute_remappings ::attribute-remappings})
  :pre-insert pre-insert
  :pre-update pre-update})
