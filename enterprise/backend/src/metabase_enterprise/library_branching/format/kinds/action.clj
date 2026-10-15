(ns metabase-enterprise.library-branching.format.kinds.action
  "The codec of the kind :action: a data action, as the file `<name>.action.yaml`. An action with a model is in the
  directory of its model: its place is the model, under `model`, and the file has no `collection`. An action with no
  model is in a data actions or data app collection, under `collection`, or at the root of the data actions area, in
  `actions/`. An action of type query runs `dataset_query`, MBQL 5 in its portable JSON form, with no `:lib/type` that
  the query's structure implies; an implicit action runs the row operation `implicit_kind` on the table of its model."
  (:require
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]
   [metabase-enterprise.library-branching.format.kinds.visualization :as visualization]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.registry :as registry]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(def implicit-kinds
  "The row operations of an implicit action."
  #{"row/create" "row/update" "row/delete" "bulk/create" "bulk/update" "bulk/delete"})

(registry/def ::query
  [:and
   [:map
    [:database :string]
    [:stages [:vector {:min 1} [:map-of :keyword :any]]]]
   [:fn {:error/message "every stage and join of the query has its :lib/type"} portable/implied-keys?]])

(defn home
  "A root-level action, an action with no model and no collection, is in `actions/`."
  [_item]
  {:dir ["actions"]})

(defn refs
  "The references of an action: its model (role `:model`), and the references of its query, its parameters, its
  parameter mappings and its visualization settings."
  [_id {:keys [model dataset_query visualization_settings] :as attrs}]
  (cond-> (-> (portable/refs (dissoc attrs :model :dataset_query :visualization_settings))
              (into (when dataset_query (portable/query-refs dataset_query)))
              (into (visualization/refs visualization_settings)))
    (some? model) (conj [:model model])))

(defn encode-attrs
  "The attributes as the file holds them: the query without its implied keys."
  [attrs]
  (cond-> attrs
    (contains? attrs :dataset_query) (update :dataset_query portable/omit-implied)))

(defn decode-attrs
  "The inverse of [[encode-attrs]]."
  [attrs]
  (cond-> attrs
    (contains? attrs :dataset_query) (update :dataset_query portable/restore-implied)))

(defn fits-type?
  "True iff the attributes of action `item` fit its type: a query action has a query and no implicit kind; an implicit
  action has a model and an implicit kind, and no query."
  [{{:keys [type model implicit_kind dataset_query]} :attrs}]
  (case type
    "query"    (and (some? dataset_query) (nil? implicit_kind))
    "implicit" (and (some? model) (some? implicit_kind) (nil? dataset_query))
    false))

(defn in-its-model?
  "True iff action `item` with a model has that model as its place. An action with no model has any place."
  [{:keys [place attrs]}]
  (let [model (:model attrs)]
    (or (nil? model) (= model place))))

(def spec
  "The spec of the action codec. The archive columns (scope), the public link (instance-local), the database of a
  query action (derived from its query), the collection of an action with a model (derived from its model) and the
  bookkeeping columns are not attributes."
  {:kind         :action
   :word         "action"
   :directory?   false
   :home         #'home
   :id-schema    ::snapshot/entity-id
   :name-key     :name
   :place-key    :collection
   :attrs        {:description            {:schema :string}
                  :model                  {:schema ::snapshot/entity-id}
                  :type                   {:schema [:enum "implicit" "query"] :required? true}
                  :implicit_kind          {:schema (into [:enum] (sort implicit-kinds))}
                  :dataset_query          {:schema ::query}
                  :parameters             {:schema ::common/document-vector :default []}
                  :parameter_mappings     {:schema ::common/document-vector :default []}
                  :visualization_settings {:schema ::common/document-map :default {}}}
   :encode-attrs #'encode-attrs
   :decode-attrs #'decode-attrs
   :refs         #'refs
   :checks       [[:fn {:error/message "a query action has a query; an implicit action has a model and an implicit kind"}
                   #'fits-type?]
                  [:fn {:error/message "the place of an action with a model is the model"} #'in-its-model?]]})

(registry/def ::item (common/item-schema spec))

(defn encode
  "The document of action `item` with identity `id`: an action with a model names it under `model`, and has no
  `collection`."
  [id item]
  (cond-> (common/encode-item spec id item)
    (some? (get-in item [:attrs :model])) (dissoc :collection)))

(defn decode
  "`[id item]` of action document `doc`. The place of an action with a model is the model. Throws ::codec/invalid for
  a document with both a model and a collection, and as `common/decode-doc` does."
  [doc]
  (when (and (some? (:model doc)) (some? (:collection doc)))
    (codec/invalid! "An action with a model has no collection: its place is its model."))
  (let [[id {:keys [attrs] :as item}] (common/decode-doc spec doc)]
    [id (cond-> item
          (some? (:model attrs)) (assoc :place (:model attrs)))]))

(def codec
  "The codec of the kind :action."
  (reify
    codec/Codec
    (kind [_] :action)
    (encode [_ id item] (encode id item))
    (decode [_ doc] (decode doc))
    (schema [_] ::item)

    layout/Layout
    (word [_] "action")
    (directory? [_] false)
    (home [_ item] (home item))))
