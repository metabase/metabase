(ns metabase.agent-api.browse-collection
  "The v2 `browse_collection` tool: structural navigation of the collection hierarchy.

   Two modes. **items** is what a collection contains — the same union-all listing the app's collection page runs
   ([[metabase.collection-items.core/collection-children]]), so the permission filter is the app's own and pinned
   items come first exactly as they do on screen. **tree** is the sidebar: collections only, no leaves, walked to a
   depth.

   Every id is a real collection: a numeric id, an entity_id, `\"root\"`, or `\"trash\"` — and trash is here so that
   restoring something is discoverable, since an agent that cannot see the trash cannot offer to undo. Collection
   *namespaces* (snippet folders, transform folders) are invisible: they are a storage detail of the app, and the
   content they hold is discovered through `search` and read through `get_content`.

   The tree does not page. A cut branch names the call that re-roots on it, because an offset into a tree means
   nothing to a reader — you expand a branch, you do not scroll one."
  (:require
   [clojure.set :as set]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.collection-items.core :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def modes
  "Every `mode` the tool accepts."
  ["items" "tree"])

(def ^:private type->model
  "The tool's `type` vocabulary — the one `search` hands out and `get_content` takes — mapped to the item listing's
   own model names. The types a collection can hold and an agent can act on; a snippet's folder or a transform's is a
   namespace the tool does not expose."
  {"question"   :card
   "model"      :dataset
   "metric"     :metric
   "dashboard"  :dashboard
   "collection" :collection
   "document"   :document
   "timeline"   :timeline})

(def ^:private model->type
  (set/map-invert type->model))

(def types
  "Every `type` the tool accepts."
  (vec (sort (keys type->model))))

(def sort-columns
  "Every `sort_column` the tool accepts. `type` sorts by the item's kind (the listing's `model` ordering — dashboards,
   then models, then metrics, then questions), spelled in the vocabulary the rows are in."
  ["name" "last_edited_at" "type"])

(def ^:private sort-column->listing-column
  {"name" "name" "last_edited_at" "last_edited_at" "type" "model"})

(def default-limit
  "Items per page when an `items` call names no `limit`."
  50)

(def max-limit
  "The most items one `items` page returns."
  200)

(def default-depth
  "Levels of the tree a `tree` call walks when it names no `depth`."
  2)

(def max-depth
  "The deepest a `tree` call may walk. Past this, re-root on the branch you want."
  5)

(def max-children-per-node
  "The most child collections one tree node lists before it names the call that expands the rest."
  20)

(def max-tree-nodes
  "The most collections one tree response carries, across every level."
  100)

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(defn- check-mode-args!
  [{:keys [mode type sort_column sort_direction limit offset depth fields]}]
  (when (= "tree" mode)
    (doseq [[k param] [[type "type"] [sort_column "sort_column"] [sort_direction "sort_direction"]
                       [limit "limit"] [offset "offset"]]
            :when (some? k)]
      (tools/teaching-error
       (tru "`{0}` applies to `mode: \"items\"`. A tree lists collections only, and re-roots instead of paging." param)))
    (when (seq fields)
      (tools/teaching-error
       (tru "`fields` picks fields from an item, so it applies to `mode: \"items\"`. Drop it, or switch the mode."))))
  (when (and (= "items" mode) (some? depth))
    (tools/teaching-error
     (tru "`depth` applies to `mode: \"tree\"`. `items` lists the contents of one collection. Drop it, or switch the mode."))))

;;; ──────────────────────────────────────────────────────────────────
;;; The collection a call is about
;;; ──────────────────────────────────────────────────────────────────

(defn- resolve-collection
  "The collection `id` names: a real collection the caller may read, the root collection, or the trash. The root has no
   read check because it has no permissions of its own — the item queries filter it down to what the caller can see."
  [id]
  (case (:kind (tools/classify-ref id))
    :root  collection/root-collection
    :trash (api/read-check (collection/trash-collection))
    :null  (tools/teaching-error
            (tru "`browse_collection` needs an `id`: a collection id, an entity_id, `\"root\"` for the top level, or `\"trash\"`."))
    (api/read-check :model/Collection (tools/resolve-id :model/Collection id))))

(defn- listing
  "One page of `collection`'s items, through the same call the app's collection page makes."
  [collection {:keys [models pinned-state sort-info archived? limit offset]}]
  (request/with-limit-and-offset limit offset
    (collection-items/collection-children
     collection
     {:models                    models
      :archived?                 archived?
      :pinned-state              pinned-state
      :sort-info                 sort-info
      :show-dashboard-questions? false
      :include-library?          false})))

;;; ──────────────────────────────────────────────────────────────────
;;; items — pinned first, then the page
;;; ──────────────────────────────────────────────────────────────────

(defn- item-row
  "One item, in the tool's shape: `type` in place of the listing's `model`, the same word an agent hands to
   `get_content`."
  [row]
  (-> row
      (assoc :type (model->type (keyword (:model row))))
      (dissoc :model)))

(defn- listing-options
  [collection {:keys [type sort_column sort_direction]}]
  {:models    (into #{} (map type->model) (or (not-empty type) types))
   :archived? (boolean (or (:archived collection) (collection/is-trash? collection)))
   :sort-info {:sort-column    (collection-items/normalize-sort-choice
                                (sort-column->listing-column (or sort_column "name")))
               :sort-direction (collection-items/normalize-sort-choice (or sort_direction "asc"))}})

(defn- page
  "The page of `collection`'s items at `offset`: the pinned ones, then the rest — the order the collection page shows,
   assembled here because the app makes it with two calls and an agent should not have to.

   The pinned block is read unpaged (a collection holds a handful of pins), and the page walks it first and continues
   into the unpinned listing. The unpinned listing is asked for even when the pinned block already filled the page: a
   listing of zero rows still reports how many there are, and `total` has to count them."
  [collection opts limit offset]
  (let [pinned   (:data (listing collection (assoc opts :pinned-state :is_pinned)))
        head     (into [] (comp (drop offset) (take limit)) pinned)
        unpinned (listing collection (assoc opts
                                            :pinned-state :is_not_pinned
                                            :limit        (- limit (count head))
                                            :offset       (max 0 (- offset (count pinned)))))]
    {:rows  (into head (:data unpinned))
     ;; an empty listing reports no total at all, so read it as the zero it is
     :total (+ (count pinned) (or (:total unpinned) 0))}))

(defn- items
  [collection {:keys [response_format fields] :as params}]
  (let [limit         (min (or (:limit params) default-limit) max-limit)
        offset        (or (:offset params) 0)
        {:keys [rows total]} (page collection (listing-options collection params) limit offset)
        more?         (< (+ offset (count rows)) total)]
    (when (:id collection)
      (tools/publish-read-event! :model/Collection collection))
    (tools/list-envelope
     (tools/project-rows {:response-format response_format
                          :fields          fields
                          :spec            (projections/spec :collection-item)}
                         (mapv item-row rows))
     (cond-> {:total total}
       more? (assoc :truncation-message
                    (tools/truncation-message {:total       total
                                               :returned    (count rows)
                                               :noun        "items"
                                               :scope       (str "in " (pr-str (:name collection)))
                                               :narrow-with [:type]
                                               :offset      offset
                                               :limit       limit}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; tree — collections only, and a cut branch names its expansion
;;; ──────────────────────────────────────────────────────────────────

(defn- child-collections
  "The sub-collections of `collection` the caller can see, capped at [[max-children-per-node]], with the number that
   exist. An empty listing reports no total, so read it as the zero it is."
  [collection]
  (let [{:keys [data total]} (listing collection {:models       #{:collection}
                                                  :archived?    (boolean (collection/is-trash? collection))
                                                  :pinned-state :all
                                                  :sort-info    {:sort-column :name :sort-direction :asc}
                                                  :limit        max-children-per-node
                                                  :offset       0})]
    {:children data :total (or total 0)}))

(defn- has-children?
  "Whether a listed collection holds sub-collections. The listing already says so — `here` is the set of kinds the
   collection directly holds — so an unexpanded node knows it has more below without a query of its own."
  [collection]
  (contains? (set (:here collection)) :collection))

(defn- expansion-message
  [{:keys [id name]} shown total]
  (tru "{0} more under {1} — browse_collection(id: {2}, mode: \"tree\")"
       (str (- total shown)) (pr-str name) (str id)))

(defn- unexpanded-message
  [{:keys [id name]}]
  (tru "not expanded — browse_collection(id: {0}, mode: \"tree\") walks below {1}" (str id) (pr-str name)))

(declare node)

(defn- expand
  "`collection`'s sub-collections as nodes, to `depth` more levels, drawing from the response's shared node `budget`:
   the nodes, how many sub-collections there are, and how many of them the response carries."
  [collection depth budget]
  (let [{:keys [children total]} (child-collections collection)
        allowed                  (take @budget children)]
    (vswap! budget - (count allowed))
    {:nodes (mapv #(node % (dec depth) budget) allowed)
     :total total
     :shown (count allowed)}))

(defn- node
  "One node of the tree. A node the depth or the node budget stopped short of expanding still says it has more below,
   and names the call that re-roots on it — a tree that just ends reads as a tree that ended."
  [collection depth budget]
  (let [base (select-keys collection [:id :name :description])]
    (if (or (zero? depth) (zero? @budget))
      (cond-> (assoc base :children [])
        (has-children? collection) (assoc :truncation_message (unexpanded-message collection)))
      (let [{:keys [nodes total shown]} (expand collection depth budget)]
        (cond-> (assoc base :children nodes)
          (< shown total) (assoc :truncation_message (expansion-message collection shown total)))))))

(defn- tree
  "The collections under `collection`, to `depth` levels. No paging: a tree re-roots."
  [collection {:keys [depth]}]
  (let [budget                      (volatile! max-tree-nodes)
        {:keys [nodes total shown]} (expand collection (or depth default-depth) budget)]
    (when (:id collection)
      (tools/publish-read-event! :model/Collection collection))
    (tools/list-envelope
     nodes
     (cond-> {:total total}
       (< shown total) (assoc :truncation-message (expansion-message collection shown total))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn browse-collection
  "Run the `browse_collection` tool. See the tool's description on `POST /v2/browse-collection` for the argument
   contract."
  [{:keys [id mode] :as params}]
  (let [mode (or mode "items")]
    (check-mode-args! (assoc params :mode mode))
    (let [collection (resolve-collection id)]
      (case mode
        "items" (items collection params)
        "tree"  (tree collection params)))))
