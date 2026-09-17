(ns metabase.source-swap.tags
  "Native template tag conversion and field matching."
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.parameters.parse :as lib.params.parse]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.source-swap.sql :as source-swap.sql]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

(defn- card-slug
  "Generate a slug for a card name, matching the frontend `slugg` library behavior.
   Collapses consecutive hyphens and trims leading/trailing hyphens."
  [card-name]
  (-> (u/slugify card-name)
      (str/replace "_" "-")
      (str/replace #"-{2,}" "-")
      (str/replace #"^-|-$" "")))

(mu/defn- find-table-tags :- ::lib.schema.template-tag/template-tags
  "Find all template tags of :type :table that reference the given `table-id`."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   table-id      :- ::lib.schema.id/table]
  (filter (fn [tag]
            (and (= (:type tag) :table)
                 (= (:table-id tag) table-id)))
          template-tags))

(mu/defn table->table :- ::lib.schema.template-tag/template-tags
  "Update :type :table template tags when swapping table→table.
   Just updates the :table-id field."
  [template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   old-table-id  :- ::lib.schema.id/table
   new-table-id  :- ::lib.schema.id/table]
  (mapv (fn [tag]
          (cond-> tag
            (and (= (:type tag) :table)
                 (= (:table-id tag) old-table-id))
            (assoc :table-id new-table-id)))
        template-tags))

(mu/defn remap-dimensions :- ::lib.schema.template-tag/template-tags
  "Update :type :dimension and :type :temporal-unit template tags, remapping field IDs from old table to new table.
   Finds matching fields by name."
  [query         :- ::lib.schema/query
   template-tags :- [:maybe ::lib.schema.template-tag/template-tags]
   old-table-id  :- ::lib.schema.id/table
   new-table-id  :- ::lib.schema.id/table]
  (let [old-fields (lib.metadata/fields query old-table-id)
        new-fields (lib.metadata/fields query new-table-id)]
    (mapv (fn [tag]
            (or (when (#{:dimension :temporal-unit} (:type tag))
                  (when-some [field (lib/find-matching-column (:dimension tag) old-fields)]
                    (when-some [new-field (perf/some #(when (= (:name %) (:name field)) %) new-fields)]
                      (assoc tag :dimension (lib/ref new-field)))))
                tag))
          template-tags)))

(defn card-tag
  "A card template tag with a slug derived from its name."
  [card-id card-name]
  (let [tag-name (str "#" card-id "-" (card-slug card-name))]
    {:type :card :card-id card-id :name tag-name :display-name tag-name}))

(defn table->card
  "Convert matching table tags to one card tag, retaining the first tag's required/default settings."
  [sql template-tags old-table-id new-card-id new-card-name]
  (let [table-tags (find-table-tags template-tags old-table-id)
        names      (into #{} (map :name) table-tags)
        new-tag    (merge (select-keys (first table-tags) [:required :default])
                          (card-tag new-card-id new-card-name))]
    (if (seq table-tags)
      {:sql (source-swap.sql/render-tokens
             (lib.params.parse/parse sql)
             #(source-swap.sql/template-ref (if (names %) (:name new-tag) %)))
       :template-tags (conj (into [] (remove #(names (:name %))) template-tags) new-tag)}
      {:sql sql :template-tags template-tags})))

(defn- card-tag-name?
  [card-id tag-name]
  (let [prefix (str "#" card-id)]
    (or (= tag-name prefix) (str/starts-with? tag-name (str prefix "-")))))

(defn render-card->table
  "Render parsed SQL with matching card references replaced by a quoted table name."
  [parsed old-card-id table-name]
  (source-swap.sql/render-tokens parsed
                                 #(if (card-tag-name? old-card-id %) table-name (source-swap.sql/template-ref %))))

(defn- replacement-card-tag-name
  [old-card-id new-card-id new-card-name tag-name]
  (str "#" new-card-id
       (when (and new-card-name (str/starts-with? tag-name (str "#" old-card-id "-")))
         (str "-" (card-slug new-card-name)))))

(mu/defn card->card :- ::lib.schema.template-tag/template-tags
  "Replace card IDs and names in tags, preserving the presence of a slug and all other attributes."
  [tags          :- [:maybe ::lib.schema.template-tag/template-tags]
   old-card-id   :- ::lib.schema.id/card
   new-card-id   :- ::lib.schema.id/card
   new-card-name :- :string]
  (mapv (fn [{tag-name :name, :as tag}]
          (if (= (:card-id tag) old-card-id)
            (let [new-name (replacement-card-tag-name old-card-id new-card-id new-card-name tag-name)]
              (assoc tag :card-id new-card-id :name new-name :display-name new-name))
            tag))
        tags))

(defn render-card->card
  "Render parsed SQL with matching card references renamed, retaining the presence of a slug."
  [parsed old-card-id new-card-id new-card-name]
  (source-swap.sql/render-tokens
   parsed
   #(source-swap.sql/template-ref
     (if (card-tag-name? old-card-id %)
       (replacement-card-tag-name old-card-id new-card-id new-card-name %)
       %))))
