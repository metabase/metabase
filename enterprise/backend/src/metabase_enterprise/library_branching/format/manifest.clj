(ns metabase-enterprise.library-branching.format.manifest
  "The manifest: the databases, schemas, tables and fields of an instance, with their types, as the file
  [[path]] of a repository. It holds no data and no connection details. CI reads it for the semantic check."
  (:require
   [malli.error :as me]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.registry :as registry]))

(set! *warn-on-reflection* true)

(def path
  "The path of the manifest in a repository."
  ".metabase/manifest.yaml")

(def version
  "The manifest format that this code writes and reads."
  "library-branching-manifest/1")

(registry/def ::manifest
  "The manifest document. A field holds its nested fields under `:fields`."
  [:schema
   {:registry {::field [:map {:closed true}
                        [:name [:string {:min 1}]]
                        [:base_type {:optional true} [:string {:min 1}]]
                        [:effective_type {:optional true} [:string {:min 1}]]
                        [:fields {:optional true} [:vector [:ref ::field]]]]}}
   [:map {:closed true}
    [:format [:= version]]
    [:databases [:vector [:map {:closed true}
                          [:name [:string {:min 1}]]
                          [:engine {:optional true} [:string {:min 1}]]
                          [:tables {:optional true}
                           [:vector [:map {:closed true}
                                     [:name [:string {:min 1}]]
                                     [:schema {:optional true} :string]
                                     [:fields {:optional true} [:vector [:ref ::field]]]]]]]]]]])

(defn- field-entries
  "The entries of the fields `fields` under natural key `prefix`, each nested field after its parent."
  [prefix fields]
  (mapcat (fn [{:keys [base_type effective_type] :as field}]
            (let [k (conj prefix (:name field))]
              (cons {:key    k
                     :object (cond-> {:object :field}
                               base_type      (assoc :base-type base_type)
                               effective_type (assoc :effective-type effective_type))}
                    (field-entries k (:fields field)))))
          fields))

(defn- entries
  "`[{:key natural-key :object object}]` of manifest document `doc`, in the order of the document."
  [doc]
  (mapcat (fn [{db :name :keys [engine tables]}]
            (cons {:key [db] :object (cond-> {:object :database} engine (assoc :engine engine))}
                  (mapcat (fn [{:keys [schema fields] :as table}]
                            (let [k [db schema (:name table)]]
                              (cons {:key k :object {:object :table}} (field-entries k fields))))
                          tables)))
          (:databases doc)))

(defn env
  "`{natural-key object}` of manifest document `doc`: `[database]` to `{:object :database}` (with `:engine`),
  `[database schema table]` to `{:object :table}`, and `[database schema table field ...]` to `{:object :field}` (with
  `:base-type` and `:effective-type`), a nested field under the key of its parent. A table with no schema has the
  schema nil."
  [doc]
  (into {} (map (juxt :key :object)) (entries doc)))

(defn decode
  "The environment that the manifest bytes `b` hold: `{:env (env doc)}`, or `{:findings [f ...]}`. Each finding has
  `:type` and `:reason`. The types: `:manifest-unreadable` (not one YAML document of the document model),
  `:manifest-invalid` (not a manifest document of [[version]]) and `:manifest-duplicate` (two entries with one
  natural key, with `:key`)."
  [b]
  (let [doc (try
              (codec/read-yaml b)
              (catch clojure.lang.ExceptionInfo e
                (if (= ::codec/unreadable (:type (ex-data e)))
                  {::unreadable (ex-message e)}
                  (throw e))))]
    (cond
      (contains? doc ::unreadable)
      {:findings [{:type :manifest-unreadable :reason (::unreadable doc)}]}

      (not (registry/validate ::manifest doc))
      {:findings [{:type   :manifest-invalid
                   :reason (str "The file is not a manifest of the format " version ": "
                                (pr-str (me/humanize (registry/explain ::manifest doc))))}]}

      :else
      (let [dups (->> (entries doc) (map :key) frequencies (filter (comp #(< 1 %) val)) (map key) (sort-by str))]
        (if (seq dups)
          {:findings (mapv (fn [k] {:type :manifest-duplicate :key k :reason "Two manifest entries have one natural key."})
                           dups)}
          {:env (env doc)})))))
