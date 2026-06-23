(ns metabase.explorations.groups
  "Compute the read-side group tree for a thread from its persisted Research-plan groups
   (`ExplorationThreadGroup`) and materialized query rows.

   Each persisted group becomes one top-level `\"sidebar\"` node (the sidebar heading —
   id = the group's PK as a string, name = its computed heading). Within a group, the group's
   query rows are bundled into leaves per `[card_id dimension_id]` pair — `\"singleton\"`
   when a single query, `\"page\"` when several — pointing at their group via
   `:parent_group_id`.

   Leaves are derived on read (not persisted). The group id is part of the leaf id so it
   stays unique when the same `(card, dim)` pair appears in more than one group (a metric
   can be selected in several groups)."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(defn leaf-id
  "Stable leaf id derived from `[group-id card-id dim-id]`. Treated as opaque by the FE; the
   group-id component keeps it unique when the same (card, dim) appears in two groups. Public
   so deep-link builders (see [[chart-page-url]]) use the same scheme the read tree emits and
   routes on."
  [group-id card-id dim-id]
  (str "auto:" group-id ":" card-id ":" dim-id))

(defn chart-page-url
  "Relative URL of a chart's leaf page in the exploration detail view, scoped to the group
   (`group-id`) the chart was planned under. The route segment is percent-encoded to match
   the client's `encodeURIComponent`. Used by the document-append endpoint and the AI summary
   materializer to deep-link a static `cardEmbed`'s title back to its source chart."
  [exploration-id group-id card-id dimension-id]
  (str "/question/research/" exploration-id
       "/group/" (codec/url-encode (leaf-id group-id card-id dimension-id))))

(defn- leaf-name
  "Pick the display name for a leaf: prefer the base (unsegmented) query's `:name`, fall back
   to the first query's `:name`."
  [queries]
  (let [base (some #(when (nil? (:segment_id %)) %) queries)]
    (or (:name base) (:name (first queries)))))

(defn- dimension-anchored?
  "Whether the persisted group is anchored on its dimension (one dimension crossed with several
   metrics) rather than its metric. Reads the FE-supplied `:type`; legacy rows (no `:type`) are
   inferred — a dimension block is the only shape with more than one metric."
  [group]
  (case (:type group)
    "dimension" true
    "metric"    false
    (> (count (:metrics group)) 1)))

(defn- anchor-dimension
  "The dimension a dimension-anchored group is built around (its first/only dimension)."
  [group]
  (first (:dimensions group)))

(defn- dimension-base-name
  [dim]
  (or (:display_name dim) (:dimension_id dim) ""))

(defn- dimension-long-name
  "Disambiguated dimension label `<source> - <name>` when the dim carries a source (`:group`)
   label, else the plain base name."
  [dim]
  (let [base   (dimension-base-name dim)
        source (some-> dim :group :display_name)]
    (if (str/blank? source)
      base
      (tru "{0} - {1}" source base))))

(defn- by-dimension
  "Render a `By <dimension>` label."
  [label]
  (tru "By {0}" label))

(defn group-display-name
  "Sidebar heading for a group: `By <dimension>` for a dimension-anchored block, otherwise the
   metric's name. `card-name-by-id` maps a metric Card id to its name. When `ambiguous?` (the
   base dimension name is shared by another group), the dimension is qualified by its source —
   `By <source> - <dimension>` — so same-named groups stay identifiable."
  ([group card-name-by-id]
   (group-display-name group card-name-by-id false))
  ([group card-name-by-id ambiguous?]
   (if (dimension-anchored? group)
     (let [dim (anchor-dimension group)]
       (by-dimension (if ambiguous?
                       (dimension-long-name dim)
                       (dimension-base-name dim))))
     (or (get card-name-by-id (:card_id (first (:metrics group)))) ""))))

(defn- effective-score
  "Per-query score for ordering: contextual when present, else heuristic."
  [query]
  (or (:contextual_interestingness_score query)
      (:interestingness_score query)))

(defn- max-score
  "Max [[effective-score]] across `queries`, or `nil` if none scored."
  [queries]
  (let [scores (keep effective-score queries)]
    (when (seq scores) (apply max scores))))

(defn- sort-key
  "Sort siblings by max interestingness desc, with no-score nodes last and `:id` as the
   stable tiebreak."
  [{::keys [max-score] :keys [id]}]
  (if max-score [0 (- max-score) id] [1 0 id]))

(defn- group-node-id
  "API-facing id of a group's top-level node: the persisted group PK as a string (the FE
   treats node ids as opaque strings)."
  [group]
  (str (:id group)))

(defn- leaf-node
  "A sub-item under a group. For a dimension-anchored group the leaves vary by metric, so name
   each by its metric (Card) name; for a metric-anchored group they vary by dimension, so name
   each `By <dimension>`."
  [group [card-id dim-id] qs card-name-by-id]
  {:id              (leaf-id (:id group) card-id dim-id)
   :parent_group_id (group-node-id group)
   :type            "auto"
   :display_type    (if (= 1 (count qs)) "singleton" "page")
   :name            (if (dimension-anchored? group)
                      (or (get card-name-by-id card-id) (leaf-name qs))
                      (if-let [dn (:dimension_name (first qs))]
                        (by-dimension dn)
                        (leaf-name qs)))
   :query_ids       (mapv :id qs)
   ::max-score      (max-score qs)})

(defn- group-node
  [group card-name-by-id ambiguous?]
  (let [display-name (group-display-name group card-name-by-id ambiguous?)]
    {:id              (group-node-id group)
     :parent_group_id nil
     :type            "auto"
     :display_type    "sidebar"
     ;; `:name` mirrors the generic node field; `:group_name` is the presentation heading the
     ;; FE actually renders for a sidebar group.
     :name            display-name
     :group_name      display-name
     :query_ids       []
     ::max-score      nil}))

(defn group-tree
  "Given a thread's persisted `ExplorationThreadGroup` groups (in authoring order) and its
   hydrated query rows, return the flat depth-first `ExplorationQueryGroup` vector:

       {:id              \"<group-pk>\" | \"auto:<group-pk>:<card_id>:<dim_id>\"
        :parent_group_id <group-pk-string> | nil
        :position        <0-indexed slot in the returned vector>
        :type            \"auto\"
        :display_type    \"sidebar\" | \"singleton\" | \"page\"
        :name            <computed group heading | leaf base-query name | nil>
        :query_ids       [<id> <id> ...]}

   Each group is emitted as a top-level `\"sidebar\"` node immediately followed by its
   `[card_id dimension_id]` leaf children (sorted by interestingness desc). Query rows are
   matched to their group via the `group_id` the planner stamped on each row; rows whose
   group isn't in `groups` are dropped."
  [groups queries card-name-by-id]
  (let [base-name-counts (->> groups
                              (filter dimension-anchored?)
                              (map #(dimension-base-name (anchor-dimension %)))
                              frequencies)
        ambiguous?    (fn [group]
                        (and (dimension-anchored? group)
                             (> (get base-name-counts
                                     (dimension-base-name (anchor-dimension group)) 0)
                                1)))
        rows-by-group (group-by :group_id queries)
        depth-first   (mapcat
                       (fn [group]
                         (let [leaves (->> (get rows-by-group (:id group) [])
                                           (group-by (juxt :card_id :dimension_id))
                                           (map (fn [[k qs]] (leaf-node group k qs card-name-by-id)))
                                           (sort-by sort-key))]
                           (cons (group-node group card-name-by-id (ambiguous? group)) leaves)))
                       groups)]
    (into [] (comp (map-indexed #(assoc %2 :position %1))
                   (map #(dissoc % ::max-score)))
          depth-first)))
