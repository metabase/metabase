(ns metabase-enterprise.transforms-python.db
  "Application database queries for the transforms-python module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::python-library-filters
  "Which PythonLibraries a query applies to. Keys mirror the columns of `python_library`: a scalar matches that value."
  [:map {:closed true}
   [:id   {:optional true} ms/PositiveInt]
   [:path {:optional true} :string]])

(mr/def ::python-library-opts
  "The filters above plus the columns to select."
  [:merge
   ::python-library-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::transforms-python.schema/python-library.column]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/PythonLibrary columns))

(mu/defn table-database-ids
  "The set of Database IDs of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-database-id
  "The Database ID of the raw table row with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn update-run-message!
  "Set the message of the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   message :- [:maybe :string]]
  (t2/update! :model/TransformRun :id run-id {:message message}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-python-library :- [:maybe ::transforms-python.schema/python-library.partial]
  "The first PythonLibrary matching `opts`, or nil."
  ([]
   (select-one-python-library nil))
  ([{:keys [columns] :as opts} :- [:maybe ::python-library-opts]]
   (apply t2/select-one (->model columns) (u.query/opts->args opts))))

(mu/defn select-python-libraries :- [:sequential ::transforms-python.schema/python-library.partial]
  "The PythonLibraries matching `opts`."
  ([]
   (select-python-libraries nil))
  ([{:keys [columns] :as opts} :- [:maybe ::python-library-opts]]
   (apply t2/select (->model columns) (u.query/opts->args opts))))

;;; ------------------------------- Queries used only by the transforms-python module -------------------------------

(mu/defn upsert-python-library-source! :- ms/PositiveInt
  "Insert or update the PythonLibrary at `path`, setting its source to `source`. Returns the ID of the row."
  [path   :- :string
   source :- :string]
  (mdb/update-or-insert! :model/PythonLibrary
                         {:path path}
                         (constantly {:path path :source source})))

(mu/defn library-sources-by-path :- [:map-of :string [:maybe [:or :keyword :string]]]
  "A map of path to source for every PythonLibrary."
  []
  (into {} (map (juxt :path :source)) (select-python-libraries {:columns [:path :source]})))

(mu/defn top-level-fields-metadata
  "The export metadata columns of the active top-level Fields of the Table with `table-id`, in database order."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name :base_type :effective_type :semantic_type :database_type :database_position]
             :table_id table-id
             :active true
             ;; we are only interested in top-level objects, so filter out nested fields (parent or path)
             :parent_id nil
             :nfc_path nil
             {:from     [(warehouse-schema-overlay/field-query)]
              :order-by [[:database_position :asc]]}))
