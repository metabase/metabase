(ns metabase.documents.prose-mirror
  "Manipulate the prose mirror ast for documents"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:private ExploreFilterScalar
  [:maybe [:or :string number? :boolean]])

(mr/def ::card-embed.explore-filter
  "One explore-further filter `metabase.explorations` snapshots onto a static card embed: the filter as the client
  sent it, plus the name of the dimension it is on. Its `:field_ref` is the legacy `field_ref` of the chart column
  that was clicked."
  [:map {:closed true}
   [:operator       :string]
   [:field_ref      [:ref ::lib.schema.parameter/dimension.target]]
   [:value          {:optional true} ExploreFilterScalar]
   [:values         {:optional true} [:tuple ExploreFilterScalar ExploreFilterScalar]]
   [:display_value  :string]
   [:dimension_name {:optional true} [:maybe :string]]])

(mr/def ::card-embed.host-data
  "What `metabase.explorations` writes under `:host_data` of a static card embed so the frontend can render the
  embed's filter pills and hover highlights without a live lookup."
  [:map {:closed true}
   [:query_ids       {:optional true} [:maybe [:sequential :int]]]
   [:explore_filters {:optional true} [:maybe [:sequential [:ref ::card-embed.explore-filter]]]]])

(mr/def ::node.attrs
  "The `attrs` of a ProseMirror node: the ones this code reads by name, the ones `metabase.explorations` writes onto a
  static card embed, and whatever else the editor put there -- every node type has its own attributes and the editor
  owns that set. Every key, declared or not, is a string, so the map never mixes keyword and string keys."
  (ms/string-keyed-object
   ["id"               {:optional true} [:maybe [:or :int :string]]]
   ["_id"              {:optional true} [:maybe [:or :string :uuid]]]
   ["model"            {:optional true} [:maybe :string]]
   ["entityId"         {:optional true} [:maybe [:or :int :string]]]
   ["label"            {:optional true} [:maybe :string]]
   ["stored_result_id" {:optional true} [:maybe :int]]
   ["chart_href"       {:optional true} [:maybe :string]]
   ["child_target_id"  {:optional true} [:maybe :string]]
   ["host_data"        {:optional true} [:maybe [:ref ::card-embed.host-data]]]))

(mr/def ::ast
  "Schema for a prose-mirror document AST as it arrives at the API or is read back from the application database: a
  node in the shape ProseMirror's `Node.toJSON` emits, whose children and marks are nodes too."
  [:map
   {:closed           true
    :decode/normalize (fn [ast]
                        (cond-> ast
                          (map? ast) walk/keywordize-keys))}
   [:type                     :string]
   [:attrs   {:optional true} [:maybe [:ref ::node.attrs]]]
   [:content {:optional true} [:maybe [:sequential [:ref ::ast]]]]
   [:marks   {:optional true} [:maybe [:sequential [:ref ::ast]]]]
   [:text    {:optional true} [:maybe :string]]])

(defn normalize-document
  "Normalize a document AST on its way in from the API or out of the application database. A document in another
  `content_type` is not a ProseMirror node and passes through untouched."
  [document]
  (if (and (map? document) (some #(contains? document %) [:type "type"]))
    (lib/normalize ::ast document)
    document))

(def card-embed-type
  "Type of a card-embed node. Carries either `:id` (live Card reference) or
  `:stored_result_id` (cached snapshot in `stored_result`). Live-mode embeds render
  through the Card; static-mode embeds render from the cached blob and are read-only."
  "cardEmbed")

(def smart-link-type
  "Type of a smart-link node"
  "smartLink")

(def prose-mirror-content-type
  "The vendored 'mime-type' for documents saved using the prose-mirror ast."
  "application/json+vnd.prose-mirror")

(defn- assert-prose-mirror
  "Asserts the content-type is correct for the document or throw"
  [{:keys [content_type]}]
  (when-not (= content_type prose-mirror-content-type)
    (throw (ex-info "Document does not have the prose mirror content-type"
                    {:content-type content_type
                     :status-code 400}))))

(defn update-ast
  "Update a node that matches a predicate using a post-walk.

  Args:
  - document - a :model/Document, this will check that content type is valid for prose mirror
  - predicate - a one-arg function returning true a given node should be updated
  - updater - a one-arg function taking the node and returning the new node

  Returns:
  - the updated prose-mirror ast"
  [{:keys [document] :as doc} predicate updater]
  (assert-prose-mirror doc)
  (assoc doc :document
         (walk/postwalk (fn ast-walker
                          [node]
                          (cond-> node
                            (predicate node) updater))
                        document)))

(defn collect-ast
  "Collect values from the ast lazily removes nils

  Args:
  - document - a :model/Document, this will check that the content-type is valid for prose mirror
  - collector - a function that extracts values from a given node

  Returns:
  - a lazy seq of results from collector"
  [{:keys [document] :as doc} collector]
  (assert-prose-mirror doc)
  (->> (tree-seq :content :content document)
       (keep collector)))

(defn ast->text
  "Extract the concatenated user-visible text from a prose-mirror document AST (the value of a
  document's `:document` field).

  Walks every node, in document order, and joins:
  - the `:text` of `text` nodes, and
  - the `:label` attr of reference nodes (smart links, mentions) — the text the editor actually
    renders in place of the node.

  Nodes that render no inline prose (card embeds, layout containers) contribute nothing.
  Returns a (possibly empty) string."
  [ast]
  (->> (tree-seq :content :content ast)
       (mapcat (juxt :text #(get (:attrs %) "label")))
       (remove str/blank?)
       (str/join " ")))

(defn node-entity-id
  "The referenced entity id carried by a `smartLink` (`\"entityId\"`) or `cardEmbed` (`\"id\"`) node, or nil.

   Returning the id only when it is a positive integer keeps any downstream Toucan lookup parameterized."
  [{:keys [type attrs]}]
  (let [id (get attrs (if (= smart-link-type type) "entityId" "id"))]
    (when (pos-int? id)
      id)))

(defn card-ids
  "Get the Card ids referenced by live-mode `cardEmbed` nodes (those with a positive `\"id\"`).
  Static-mode embeds (with `\"stored_result_id\"`) are skipped — they don't reference a Card."
  [document]
  (collect-ast document #(when (and (= card-embed-type (:type %))
                                    (pos-int? (get (:attrs %) "id")))
                           (get (:attrs %) "id"))))

(defn insert-card-embed
  "Insert an embed for the card with `card-id` into the document's prose-mirror ast.

  The embed is a `resizeNode`-wrapped `cardEmbed` node, the same shape the document editor
  produces. `index` is a 0-based position among the ast's top-level blocks (0 inserts at the
  very top); a `nil` index appends the embed at the end and out-of-range indexes are clamped.
  An `_id` uuid is stamped on the node for per-node identity. `extra-attrs` (optional) are
  merged onto the embed attrs after `\"id\"` / `\"_id\"` (e.g. `\"stored_result_id\"`, `\"chart_href\"`,
  `\"child_target_id\"`, `\"host_data\"` for static exploration embeds).

  Args:
  - doc - a :model/Document, this will check that the content-type is valid for prose mirror
  - card-id - the id of an existing card to embed
  - index - 0-based top-level block position, or nil to append
  - extra-attrs - optional map of additional attrs to merge onto the cardEmbed

  Returns:
  - the document with its :document ast updated"
  ([doc card-id index]
   (insert-card-embed doc card-id index nil))
  ([{:keys [document] :as doc} card-id index extra-attrs]
   (assert-prose-mirror doc)
   (let [blocks (vec (:content document))
         at     (if (int? index)
                  (-> index (max 0) (min (count blocks)))
                  (count blocks))
         attrs  (merge {"id" card-id "_id" (random-uuid)}
                       extra-attrs)
         embed  {:type    "resizeNode"
                 :content [{:type  card-embed-type
                            :attrs attrs}]}]
     (assoc doc :document
            (assoc (or document {:type "doc"})
                   :content (into (conj (subvec blocks 0 at) embed) (subvec blocks at)))))))
