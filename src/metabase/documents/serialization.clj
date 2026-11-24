(ns metabase.documents.serialization
  "The SerDes of Documents, whose bodies name cards, dashboards and tables by entity paths in place of ids."
  (:require
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private model->serdes-model
  {"card"      "Card"
   "dataset"   "Card"
   "dashboard" "Dashboard"
   "table"     "Table"})

(def ^:private local-id-card-embed-attrs
  "`cardEmbed` attrs holding a raw local database id that serdes cannot rewrite into a
  reference, and so must not travel. `:stored_result_id` points at a `stored_result` row — an
  ephemeral cached-snapshot record, not a first-class serdes entity — so exporting the integer
  verbatim would, on import, either dangle or silently resolve to an unrelated instance's
  snapshot. Dropping it degrades a static (snapshot-backed) embed to a live embed of the Card,
  which travels and renders the same query."
  [:stored_result_id])

(defn- serdes-rewritable-node?
  "The AST nodes whose ids serdes rewrites between database ids and entity ids.

  Matches on node *type* only. The id itself cannot be part of this test, because the same predicate
  runs in both directions and the two directions see different shapes: on export `:id` is a raw
  database id, but on import it is a serdes path (a vector of `{:model :id}` maps). A guard that
  expected a positive integer would therefore pass on export and silently skip every node on import,
  leaving the path unresolved. The id-shape checks belong in the readers, `walk-export-node` and `walk-import-node`."
  [node]
  (contains? #{prose-mirror/smart-link-type prose-mirror/card-embed-type} (:type node)))

(defn- table-path
  "The path a document names the Table with the `[db-name schema table-name]` reference `table-ref` by."
  [[db-name schema table-name]]
  (filterv some? [{:model "Database" :id db-name}
                  (when schema {:model "Schema" :id schema})
                  {:model "Table" :id table-name}]))

(defn- table-path->ref
  "The `[db-name schema table-name]` reference of the Table a document names by `path`."
  [path]
  (let [id-of (fn [model] (some #(when (= model (:model %)) (:id %)) path))]
    [(id-of "Database") (id-of "Schema") (id-of "Table")]))

(defn- walk-export-node
  "`node`, a cardEmbed or smartLink, with its database id replaced by the path of the entity it names, which `visit`
  resolves, or unchanged when that entity no longer exists."
  [visit {{:keys [model] :or {model "card"}} :attrs type :type :as node}]
  (let [id-key       (if (= prose-mirror/smart-link-type type) :entityId :id)
        id           (prose-mirror/node-entity-id node)
        node         (cond-> node
                       (= prose-mirror/card-embed-type type)
                       (update :attrs #(apply dissoc % local-id-card-embed-attrs)))
        serdes-model (model->serdes-model model)
        path         (when (and id serdes-model)
                       (if (= serdes-model "Table")
                         (when-let [table-ref (serialization/found-or-nil #(visit :model/Table id))]
                           (cond-> table-ref
                             (not (serialization/collecting? visit)) table-path))
                         (when-let [entity-id (serialization/found-or-nil
                                               #(visit (keyword "model" serdes-model) id))]
                           [{:model serdes-model :id entity-id}])))]
    (if path
      (assoc-in node [:attrs id-key] path)
      (u/prog1 node
        (log/warnf "entity_id not found for %s at id: %s" model id)))))

(defn- walk-import-node
  "`node`, a cardEmbed or smartLink, with the path it names replaced by the id `visit` resolves it to, or unchanged
  when that entity is missing."
  [visit {:keys [attrs type] :as node}]
  (let [id-key                        (if (= prose-mirror/smart-link-type type) :entityId :id)
        path                          (get attrs id-key)
        {:keys [model] entity-id :id} (when (sequential? path) (last path))
        id                            (cond
                                        (= model "Table") (visit :model/Table (table-path->ref path))
                                        (some? model)     (serialization/found-or-nil
                                                           #(visit (keyword "model" model) entity-id)))]
    (if id
      (assoc-in node [:attrs id-key] id)
      (u/prog1 node
        (log/warn "Model not found at path" path)))))

(defn- walk-export-document
  "The exported `:document` of `document`, its node ids replaced by the entity paths `visit` resolves them to."
  [visit document]
  (:document
   (cond-> document
     (= (:content_type document) prose-mirror/prose-mirror-content-type)
     (prose-mirror/update-ast serdes-rewritable-node? (partial walk-export-node visit)))))

(defn- walk-import-document
  "The `:document` of `entity`, normalized, its entity paths replaced by the ids `visit` resolves them to."
  [visit entity]
  (:document
   (cond-> entity
     (= (:content_type entity) prose-mirror/prose-mirror-content-type)
     (-> (update :document prose-mirror/normalize-document)
         (prose-mirror/update-ast serdes-rewritable-node? (partial walk-import-node visit))))))

(defn- export-documents
  "Exports the `:document` of `documents` with entity paths in place of ids."
  [store documents _values _opts]
  (serialization/export-in-bulk store documents walk-export-document))

(defn- import-documents
  "Imports the `:document` of `entities` with ids in place of entity paths."
  [store entities _values opts]
  (serialization/import-in-bulk store entities opts walk-import-document))

(def document-transform
  "The transform of the `document` of Documents."
  {:export export-documents
   :import import-documents})

(defn- document-deps
  "The paths of the entities the exported `document` embeds or links."
  [{:keys [content_type] :as document}]
  (when (= content_type prose-mirror/prose-mirror-content-type)
    ;; NOTE: unlike the readers below, this feeds `deserialization-dependencies`, which runs on the already-serialized
    ;; form where `:entityId` is a serdes path (a vector of {:model :id} maps), not a raw id — so it is not guarded
    ;; with `node-entity-id` here.
    (set (prose-mirror/collect-ast (update document :document prose-mirror/normalize-document)
                                   (fn document-deps [{:keys [type attrs]}]
                                     (cond
                                       (and (= prose-mirror/smart-link-type type)
                                            (contains? model->serdes-model (:model attrs)))
                                       (:entityId attrs)

                                       (= prose-mirror/card-embed-type type)
                                       (:id attrs)

                                       :else
                                       nil))))))

(defn- path-key
  "The `[model ref]` of the entity a document names by `path`."
  [path]
  (let [{:keys [model id]} (last path)]
    (if (= model "Table")
      [:model/Table (table-path->ref path)]
      [(keyword "model" model) id])))

(defn import-dependencies
  "The `[model ref]` of the Collection of each of the Document `entities` and of the entities it embeds or links."
  [entities]
  (mapv (fn [{:keys [collection_id] :as document}]
          (set (concat (map path-key (document-deps document))
                       (when collection_id #{[:model/Collection collection_id]}))))
        entities))

(defn- linked-entities
  "The `[model-name id]` of the cards `document` embeds and the entities it smart-links."
  [document]
  (when (= prose-mirror/prose-mirror-content-type (:content_type document))
    (concat
     (for [card-id (prose-mirror/card-ids document)]
       ["Card" card-id])
     (for [{{:keys [model]} :attrs :as node}
           (prose-mirror/collect-ast document #(when (= prose-mirror/smart-link-type (:type %)) %))
           :let  [link-id (prose-mirror/node-entity-id node)]
           :when (and link-id (contains? model->serdes-model model))]
       [(model->serdes-model model) link-id]))))

(defn export-dependencies
  "The `[model id]` of the Collection of each of the `documents` and of the entities it embeds or links."
  [documents]
  (mapv (fn [{:keys [collection_id] :as document}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (for [[model-name id] (linked-entities document)]
                         [(keyword "model" model-name) id]))))
        documents))
