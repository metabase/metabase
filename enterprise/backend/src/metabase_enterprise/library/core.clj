(ns metabase-enterprise.library.core
  "The Library is a set of core models provided by a git-backed filesystem.

  Library models can be queried by their filename as well as via specifically defined
  attributes.  "
  (:require
   [clojure.set :as set]
   [metabase-enterprise.git-source-of-truth.settings :as git-source-of-truth.settings]
   [metabase-enterprise.mbml.core :as mbml.core]
   [metabase-enterprise.serialization.cmd :as serdes-cmd]
   [metabase.cloud-migration.core :as cloud-migration]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]))

(def ^:dynamic *current-branch* nil)

(derive :model/Transform:v1 :metabase/library-model)

(def ^:private branch+filename->model
  "Index of the library of filename and branch to a specific model

  TODO(edpaget): use some kind of cache eviction mechanism."
  (atom {}))

(def ^:private branch+entity+index->filename
  "Lookup filename by indexed values

   TODO(edpaget): use a btree?"
  (atom {}))

(methodical/defmulti load
  "Accepts the parsed result of an mbml file and loads it as a library model applying any validation
  or transformations required from the file-representation.

  Args:
    filename: the file that was loaded
    parsed-contents: the parsed contents from mbml. It must have an :entity keyword for dispatch.

  Returns:
    the loaded library model"
  {:arglists '([filename parsed-contents])}
  (fn [_filename {:keys [entity]}] (keyword entity)))

(methodical/defmethod load :metabase/library-model
  "Associate the file with an model-kw and a `id` attribute that can be used when it needs to
  interoperate with toucan models. This is separate from the human readable :identifier."
  [filename {:keys [identifier] :as parsed-file}]
  (let [with-id (assoc parsed-file
                       :filename filename
                       :id identifier)]
    (cond->> with-id
      next-method (next-method filename))))

(defn- update-source-query
  [{:keys [source body] :as model} database-id]
  (let [raw-query (or body source)
        metadata-provider (lib.metadata.jvm/application-database-metadata-provider database-id)
        resolved-query (cond
                         (string? raw-query) (lib/native-query metadata-provider raw-query)
                         (map? raw-query) (serdes/import-mbql raw-query))]
    (assoc model :source {:type "query"
                          :query resolved-query})))

(methodical/defmethod load :model/Transform:v1
  "Validate the transform.

  TODO(edpaget): merge this with the validation in transforms.core"
  [filename {:keys [tags database] :as mbml-map}]
  (let [tag-ids (t2/select-pks-vec :model/TransformTag :name [:in tags])
        database-id (t2/select-one-pk :model/Database :name database)]
    (when-not (= (count tag-ids) (count (set tags)))
      (throw (ex-info "Missing Tags" {:type :model/Transform :data mbml-map :file filename})))
    (when-not database-id
      (throw (ex-info "Missing Database" {:type :model/Transform :data mbml-map :file filename})))
    (cond->> (-> mbml-map
                 (update-source-query database-id)
                 (dissoc :body)
                 (assoc :database_id database-id :tag_ids tag-ids))
      next-method (next-method filename))))

(methodical/defmulti index
  "Create a map of indexes by entity type used for lookups of items in the library

  Args:
    model: library model to index

  Returns:
    sequence of vector paths indidcating where the entity should be indexed."
  {:arglists '([model])}
  (fn [{:keys [entity]}] (keyword entity)))

(methodical/defmethod index :metabase/library-model
  "All models are indexed by their identifier"
  [{:keys [identifier] :as model}]
  (cond->> [[:identifier identifier]]
    next-method (concat (next-method model))))

(methodical/defmethod index :model/Transform:v1
  "Index transforms by their tags and tag_ids"
  [{:keys [tags tag_ids] :as model}]
  (cond->> (concat (map #(vector :tag %1) tags) (map #(vector :tag_id %1) tag_ids))
    next-method (concat (next-method model))))

(defn current-branch
  []
  (or *current-branch* (git-source-of-truth.settings/git-sync-import-branch)))

(def ^:private entity-type->model
  {"model/Transform:v1" :model/Transform})

(defn index-library!
  "Given a list of file paths load models and build an index of the library."
  [paths]
  (let [branch (current-branch)]
    (swap! branch+filename->model
           assoc branch
           (reduce (fn [accum path]
                     ;; Turn into t2 instances so hydrate works (hopefully!)
                     (let [{:keys [entity] :as model} (load path (mbml.core/parse-mbml-file path))]
                       (assoc accum path (t2/instance (entity-type->model entity) model))))
                   {} paths))
    (swap! branch+entity+index->filename
           assoc branch
           (reduce-kv (fn [accum filename {:keys [entity] :as model}]
                        (reduce (fn [accum* index]
                                  (let [path (concat [(entity-type->model entity)] index)]
                                    (if (get-in accum* path)
                                      (update-in accum* path conj filename)
                                      (assoc-in accum* path #{filename}))))
                                accum
                                (index model)))
                      {} (get @branch+filename->model branch)))))

(defn select
  "Retrive a model by entity and identifier

  Args:
    model: the keyword of the model to lookup
    identifier: the identifier of the model

  Returns:
    the library model"
  [model identifier]
  (when-let [filename (get-in @branch+entity+index->filename [(current-branch) model :identifier identifier])]
    (when (seq filename)
      (get-in @branch+filename->model [(current-branch) (first filename)]))))

(defn find-by
  "Find models give one or more indexes

  Args:
    model: the keyword of the model to lookup
    index: the index to search on
    value: a single value or series of values to lookup from

  Return:
    sequence of models found."
  [model index value]
  (->> (map #(get-in @branch+entity+index->filename [(current-branch) model index %1]) value)
       (reduce set/union #{})
       (map #(get-in @branch+filename->model [(current-branch) %1]))))

(defn select-all
  "Retrive a model by entity and identifier

  Args:
    model: the keyword of the model to lookup

  Returns:
    a sequence of the library models"
  [model]
  (when-let [filenames (->> (get-in @branch+entity+index->filename [(current-branch) model :identifier])
                            vals
                            (reduce set/union #{}))]
    (get-in @branch+entity+index->filename [(current-branch) model :identifier])
    (prn filenames)
    (prn (map #(get-in @branch+filename->model [(current-branch) %1]) filenames))
    (prn (get-in @branch+filename->model [(current-branch)]))
    (map #(get-in @branch+filename->model [(current-branch) %1]) filenames)))
