(ns metabase-enterprise.transforms-python.db
  "Application database queries for the transforms-python module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn update-run-message!
  "Set the message of the TransformRun with `run-id`."
  [run-id  :- ms/PositiveInt
   message :- [:maybe :string]]
  (t2/update! :model/TransformRun :id run-id {:message message}))

(mu/defn python-library :- [:maybe ::transforms-python.schema/python-library]
  "The ::transforms-python.schema/python-library with `library-id`, or nil."
  [library-id :- ms/PositiveInt]
  (t2/select-one :model/PythonLibrary :id [:auto/param library-id]))

(mu/defn python-library-by-path
  "The PythonLibrary at `path`, or nil."
  [path :- :string]
  (t2/select-one :model/PythonLibrary :path path))

(mu/defn upsert-python-library-source!
  "Insert or update the PythonLibrary at `path`, setting its source to `source` and, on insert only, the columns in
  `insert-values`. Returns the ID of the row."
  [path          :- :string
   source        :- :string
   insert-values :- [:map {:closed true}
                     [:entity_id  {:optional true} :string]
                     [:is_default {:optional true} :boolean]]]
  (mdb/update-or-insert! :model/PythonLibrary
                         {:path path}
                         (fn [existing]
                           (cond-> {:path path :source source}
                             (nil? existing) (merge insert-values)))))

(mu/defn library-sources-by-path
  "A map of path to source for every PythonLibrary."
  []
  (t2/select-fn->fn :path :source :model/PythonLibrary))
