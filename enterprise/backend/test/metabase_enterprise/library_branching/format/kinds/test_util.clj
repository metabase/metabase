(ns metabase-enterprise.library-branching.format.kinds.test-util
  "test.check generators of the `:attrs` of each kind, and of snapshots of the kinds whose items fit the schemas of
  their codecs.

  Each generator is constructive: it builds a value of the content schema from random choices, filters nothing, and
  never gives an attribute at its default value. An optional attribute is absent or present; absent is the first
  choice, so a shrunk value has few attributes."
  (:require
   [clojure.string :as str]
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.dashboard :as dashboard]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Values ------------------------------------------------------

(def text-gen
  "Generates strings, some of which YAML must quote or write as a block."
  (gen/frequency [[4 gen/string-alphanumeric]
                  [1 (gen/elements ["" "a: b" "line\nline\n" "null" "123" "- x" "{{x}}" "Société"])]]))

(def ^:private key-gen
  (gen/elements [:a :b :column_settings :graph.dimensions :lib/x (keyword "snippet: X")]))

(def document-gen
  "Generates document values: maps with keyword keys, vectors, strings, integers, booleans and nil."
  (gen/recursive-gen (fn [inner]
                       (gen/one-of [(gen/vector inner 0 3)
                                    (gen/fmap #(into {} %) (gen/vector (gen/tuple key-gen inner) 0 3))]))
                     (gen/one-of [text-gen gen/large-integer gen/boolean (gen/return nil)])))

(def ^:private document-map-gen
  "Generates a document map with at least one entry."
  (gen/fmap #(into {} %) (gen/vector (gen/tuple key-gen document-gen) 1 3)))

(def ^:private non-empty-text-gen
  (gen/fmap (fn [[c s]] (str c s)) (gen/tuple gen/char-alphanumeric text-gen)))

(def field-key-gen
  "Generates the natural key of a field: `[database schema table field]`."
  (gen/fmap (fn [[k field]] (conj k field)) (gen/tuple lb.tu/table-key-gen (gen/elements ["ID" "TOTAL" "USER_ID"]))))

(def ^:private uuid-text-gen (gen/fmap str gen/uuid))

(defn- optional
  "`[k gen]` as present or absent; absent is ::absent."
  [g]
  (gen/one-of [(gen/return ::absent) g]))

(defn- attrs-of
  "Generates an attribute map from `{k [required? gen]}`: each required key has a value, each other key is absent or
  has one."
  [spec]
  (gen/fmap (fn [pairs] (into {} (remove (comp #{::absent} second)) pairs))
            (apply gen/tuple (for [[k [required? g]] (sort-by key spec)]
                               (gen/fmap (partial vector k) (if required? g (optional g)))))))

;;; ------------------------------------------------ Portable MBQL ----------------------------------------------------

(def field-ref-gen
  "Generates a field reference in the JSON form: by field key, with or without a source field, or by column name."
  (gen/one-of [(gen/fmap (fn [k] ["field" {:base-type "type/Integer"} k]) field-key-gen)
               (gen/fmap (fn [[k fk]] ["field" {:base-type "type/Integer" :source-field fk} k])
                         (gen/tuple field-key-gen field-key-gen))
               (gen/return ["field" {:base-type "type/Integer"} "TOTAL"])]))

(def ^:private aggregation-gen
  (gen/one-of [(gen/return ["count" {}])
               (gen/fmap (fn [r] ["sum" {} r]) field-ref-gen)
               (gen/fmap (fn [id] ["metric" {} id]) lb.tu/entity-id-gen)
               (gen/fmap (fn [id] ["measure" {} id]) lb.tu/entity-id-gen)]))

(def ^:private filter-gen
  (gen/one-of [(gen/fmap (fn [[r n]] [">" {} r n]) (gen/tuple field-ref-gen gen/large-integer))
               (gen/fmap (fn [id] ["segment" {} id]) lb.tu/entity-id-gen)]))

(def template-tag-gen
  "Generates a template tag in the JSON form, with its id: a text, card, snippet or dimension tag."
  (gen/one-of [(gen/fmap (fn [[n id]] {:type "text" :name n :display-name n :id id})
                         (gen/tuple (gen/elements ["min_price" "x"]) uuid-text-gen))
               (gen/fmap (fn [[eid id]] {:type "card" :name "#1-orders" :card-id eid :id id})
                         (gen/tuple lb.tu/entity-id-gen uuid-text-gen))
               (gen/fmap (fn [[eid id]] {:type "snippet" :name "snippet: Base" :snippet-name "Base" :snippet-id eid
                                         :id id})
                         (gen/tuple lb.tu/entity-id-gen uuid-text-gen))
               (gen/fmap (fn [[r id]] {:type "dimension" :name "when" :dimension r :id id})
                         (gen/tuple field-ref-gen uuid-text-gen))]))

(def template-tags-gen
  "Generates a template tag map, keyed by the tag names, with at least one tag."
  (gen/fmap (fn [tags] (into {} (map (fn [t] [(keyword (:name t)) t])) tags))
            (gen/vector template-tag-gen 1 3)))

(defn- stage-type-gen
  "Mostly the implied stage type; sometimes another one, which encode must keep."
  [implied]
  (gen/frequency [[9 (gen/return implied)] [1 (gen/return "mbql.stage/other")]]))

(defn- clauses-gen
  "Generates the clauses of an MBQL stage."
  [joins-gen]
  (attrs-of {:aggregation [false (gen/vector aggregation-gen 1 2)]
             :breakout    [false (gen/vector field-ref-gen 1 2)]
             :filters     [false (gen/vector filter-gen 1 2)]
             :joins       [false joins-gen]}))

(declare join-gen)

(defn- source-stage-gen
  "Generates a first stage: from a table, from a card, or native. `depth` bounds the nesting of joins."
  [depth]
  (gen/one-of
   [(gen/fmap (fn [[t k c]] (merge c {:lib/type t :source-table k}))
              (gen/tuple (stage-type-gen "mbql.stage/mbql") lb.tu/table-key-gen (clauses-gen (join-gen depth))))
    (gen/fmap (fn [[t id c]] (merge c {:lib/type t :source-card id}))
              (gen/tuple (stage-type-gen "mbql.stage/mbql") lb.tu/entity-id-gen (clauses-gen (join-gen depth))))
    (gen/fmap (fn [[t tags]] {:lib/type t :native "SELECT {{x}}" :template-tags tags})
              (gen/tuple (stage-type-gen "mbql.stage/native") template-tags-gen))]))

(defn- join-gen
  "Generates the joins of a stage: none past `depth` 0."
  [depth]
  (if (zero? depth)
    (gen/return [])
    (gen/vector (gen/fmap (fn [[t stage cond-ref]] {:lib/type   t
                                                    :alias      "J"
                                                    :fields     "all"
                                                    :stages     [stage]
                                                    :conditions [["=" {} cond-ref cond-ref]]})
                          (gen/tuple (gen/frequency [[9 (gen/return "mbql/join")] [1 (gen/return "other")]])
                                     (source-stage-gen (dec depth))
                                     field-ref-gen))
                1 2)))

(def query-gen
  "Generates a query in the portable JSON form of MBQL 5, with `:lib/type` on the query, each stage and each join."
  (gen/fmap (fn [[db first-stage more]] {:lib/type "mbql/query" :database db :stages (into [first-stage] more)})
            (gen/tuple (gen/elements ["Sample Database" "Aviary"])
                       (source-stage-gen 1)
                       (gen/vector (gen/fmap (fn [[t c]] (assoc c :lib/type t))
                                             (gen/tuple (stage-type-gen "mbql.stage/mbql") (clauses-gen (gen/return []))))
                                   0 2))))

;;; ------------------------------------------------ Visualization settings -------------------------------------------

;; Each generator of this section gives `[value refs]`: a part of the visualization settings in the portable document
;; form, and the references that it holds.

(def ^:private json-field-key-gen
  "Field keys whose names JSON escapes or that hold a slash."
  (gen/fmap (fn [[k field]] (conj k field))
            (gen/tuple lb.tu/table-key-gen (gen/elements ["ID" "a/b" "say \"hi\"" "Société" "back\\slash"]))))

(defn- json-keyword
  "The keyword whose name is the JSON text of `x`, as the export gives a key that holds JSON text."
  [x]
  (keyword (json/encode x)))

(defn- refs-union
  "`[values refs]` of the pairs `pairs`: the values, and the union of their references."
  [pairs]
  [(mapv first pairs) (into #{} (mapcat second) pairs)])

(defn- map-entries-union
  "`[map refs]` of the pairs `pairs` of `[[k v] refs]`: the first entry of each key, and the union of the references of
  those entries."
  [pairs]
  (let [kept (vals (reduce (fn [m [[k] :as pair]] (if (contains? m k) m (assoc m k pair))) {} pairs))]
    (update (refs-union kept) 0 #(into {} %))))

(def ^:private column-ref-gen
  "A column reference of a column settings key: by field key (legacy and MBQL 5 options), or by name."
  (gen/one-of [(gen/fmap (fn [k] [["ref" ["field" k nil]] #{[:field [:env k]]}]) json-field-key-gen)
               (gen/fmap (fn [k] [["ref" ["field" k {"base-type" "type/Integer"}]] #{[:field [:env k]]}])
                         json-field-key-gen)
               (gen/return [["ref" ["field" "count" {"base-type" "type/Integer"}]] #{}])
               (gen/return [["name" "COUNT"] #{}])]))

(def ^:private parameter-mapping-gen
  "A click-behavior parameter mapping: to a dimension (JSON text in its key, its id and its target id), to a
  dashboard parameter, or to a native variable."
  (gen/one-of
   [(gen/fmap (fn [[k opts]]
                (let [dim  (cond-> ["dimension" ["field" k nil]] opts (conj opts))
                      text (json/encode dim)]
                  [[(keyword text) {:id     text
                                    :source {:type "column" :id "TOTAL" :name "Total"}
                                    :target {:type "dimension" :id text :dimension dim}}]
                   #{[:field [:env k]]}]))
              (gen/tuple json-field-key-gen (gen/elements [nil {:stage-number 0}])))
    (gen/fmap (fn [p] [[(keyword p) {:id p :source {:type "column" :id "ID" :name "ID"} :target {:type "parameter" :id p}}]
                       #{}])
              (gen/elements ["a1b2c3d4" "p"]))
    (gen/return [[:v {:id "v" :source {:type "column" :id "ID" :name "ID"} :target {:type "variable" :id "v"}}] #{}])]))

(def ^:private parameter-mappings-gen
  (gen/fmap map-entries-union (gen/vector parameter-mapping-gen 1 3)))

(def ^:private click-behavior-gen
  "A click behavior: a link to a question or a dashboard, with or without a tab and parameter mappings; a link to a
  URL; a cross filter; or an action menu."
  (gen/one-of
   [(gen/fmap (fn [[[link-type role] id tab [mappings mapping-refs]]]
                [(cond-> {:type "link" :linkType link-type :targetId id}
                   tab      (assoc :tabId tab)
                   mappings (assoc :parameterMapping mappings))
                 (conj (set mapping-refs) [role id])])
              (gen/tuple (gen/elements [["dashboard" :dashboard] ["question" :card]])
                         lb.tu/entity-id-gen
                         (gen/one-of [(gen/return nil) lb.tu/entity-id-gen])
                         (gen/one-of [(gen/return [nil #{}]) parameter-mappings-gen])))
    (gen/return [{:type "link" :linkType "url" :linkTemplate "https://example.com/{{ID}}"} #{}])
    (gen/fmap (fn [[mappings refs]] [{:type "crossfilter" :parameterMapping mappings} refs]) parameter-mappings-gen)
    (gen/return [{:type "actionMenu"} #{}])]))

(def ^:private column-setting-gen
  "`[[key setting] refs]` of one entry of the column settings."
  (gen/fmap (fn [[[column column-refs] title [cb cb-refs]]]
              [[(json-keyword column) (cond-> {}
                                        title (assoc :column_title title)
                                        cb    (assoc :click_behavior cb))]
               (into column-refs cb-refs)])
            (gen/tuple column-ref-gen
                       (gen/one-of [(gen/return nil) (gen/return "Title")])
                       (gen/one-of [(gen/return [nil #{}]) click-behavior-gen]))))

(def ^:private link-entity-gen
  "The entity of a link card: an item by entity id, or a table or database by natural key."
  (gen/one-of
   [(gen/fmap (fn [[[model role] id]] [{:model model :id id :name "Linked"} #{[role id]}])
              (gen/tuple (gen/elements [["card" :card] ["dataset" :card] ["question" :card] ["dashboard" :dashboard]
                                        ["collection" :collection]])
                         lb.tu/entity-id-gen))
    (gen/fmap (fn [k] [{:model "table" :id k :name "Orders"} #{[:table [:env k]]}]) lb.tu/table-key-gen)
    (gen/fmap (fn [db] [{:model "database" :id db :name db} #{[:database [:env [db]]]}])
              (gen/elements ["Sample Database" "Aviary"]))]))

(defn- optional-part
  "`[[k value] refs]` from `[value refs]` of `g`, or nil (absent, the first choice)."
  [k g]
  (gen/one-of [(gen/return nil) (gen/fmap (fn [[v refs]] [[k v] refs]) g)]))

(def visualization-settings-refs-gen
  "Generates `[settings refs]`: visualization settings in the portable document form with every position that holds a
  reference (column settings keys and click behaviors, a top-level click behavior, a link card, timelines, a pivot
  split), never empty, and the references that they hold."
  (gen/fmap
   (fn [parts]
     (let [[entries refs] (refs-union (remove nil? parts))
           settings       (into {} entries)]
       [(if (empty? settings) {:graph.dimensions ["CREATED_AT"]} settings) refs]))
   (gen/tuple
    (optional-part :column_settings (gen/fmap map-entries-union (gen/vector column-setting-gen 1 3)))
    (optional-part :click_behavior click-behavior-gen)
    (optional-part :link (gen/fmap (fn [[entity refs]] [{:entity entity} refs]) link-entity-gen))
    (optional-part :timeline.selected_timeline_ids
                   (gen/fmap (fn [ids] [ids (into #{} (map (fn [id] [:timeline id])) ids)])
                             (gen/vector lb.tu/entity-id-gen 0 2)))
    (optional-part :timeline.excluded_timeline_event_ids
                   (gen/fmap (fn [pairs] [pairs (into #{} (map (fn [[tl _]] [:timeline tl])) pairs)])
                             (gen/vector (gen/tuple lb.tu/entity-id-gen lb.tu/entity-id-gen) 0 2)))
    (optional-part :pivot_table.column_split
                   (gen/fmap (fn [k] [{:rows [["field" k nil]] :columns [] :values []} #{[:field [:env k]]}])
                             field-key-gen))
    (optional-part :graph.dimensions (gen/return [["CREATED_AT"] #{}])))))

(def visualization-settings-gen
  "Generates visualization settings of [[visualization-settings-refs-gen]], or other document maps."
  (gen/one-of [(gen/fmap first visualization-settings-refs-gen) document-map-gen]))

;;; ---------------------------------------------------- Attributes ---------------------------------------------------

(def collection-attrs-gen
  "Generates the `:attrs` of a collection."
  (attrs-of {:description     [false text-gen]
             :type            [false (gen/elements ["library" "library-data" "library-metrics" "library-dashboards"])]
             :namespace       [false (gen/elements ["snippets" "transforms" "data-actions" "data-apps"])]
             :authority_level [false (gen/return "official")]}))

(def ^:private card-attrs
  "`{k [required? gen]}` of the attributes of every card kind."
  {:description            [false text-gen]
   :display                [true (gen/elements ["scalar" "line" "bar" "table"])]
   :query                  [true query-gen]
   :visualization_settings [false visualization-settings-gen]
   :parameters             [false (gen/vector document-map-gen 1 2)]
   :parameter_mappings     [false (gen/vector document-map-gen 1 2)]
   :collection_position    [false gen/large-integer]
   :collection_preview     [false (gen/return false)]})

(def metric-attrs-gen
  "Generates the `:attrs` of a metric."
  (attrs-of (assoc card-attrs
                   :dimensions         [false (gen/vector document-map-gen 0 2)]
                   :dimension_mappings [false (gen/vector document-map-gen 0 2)])))

(def question-attrs-gen
  "Generates the `:attrs` of a question: sometimes of a dashboard or of a document."
  (attrs-of (assoc card-attrs
                   :dashboard_id [false lb.tu/entity-id-gen]
                   :document_id  [false lb.tu/entity-id-gen])))

(def result-column-gen
  "Generates a column of the result metadata of a model, in the form of the serdes export: a name, the values that a
  person edits, and for a native query its field, table and types by natural key."
  (gen/fmap (fn [[n m]] (assoc m :name n))
            (gen/tuple (gen/elements ["TOTAL" "count" "sum" "Société"])
                       (attrs-of {:display_name       [false non-empty-text-gen]
                                  :description        [false text-gen]
                                  :semantic_type      [false (gen/elements ["type/Currency" "type/FK" "type/Category"])]
                                  :visibility_type    [false (gen/elements ["normal" "details-only"])]
                                  :settings           [false document-map-gen]
                                  :field_ref          [false field-ref-gen]
                                  :fk_target_field_id [false field-key-gen]
                                  :id                 [false field-key-gen]
                                  :table_id           [false lb.tu/table-key-gen]
                                  :base_type          [false (gen/elements ["type/Integer" "type/Text"])]}))))

(def model-attrs-gen
  "Generates the `:attrs` of a model."
  (attrs-of (assoc card-attrs :result_metadata [false (gen/vector result-column-gen 1 3)])))

(defn- label-order
  "The sort key of a label `[value label]` in the order of the format: null, then false and true, then numbers, then
  texts, each kind in the order of its values."
  [[v]]
  [(cond (nil? v) 0 (boolean? v) 1 (number? v) 2 :else 3) v])

(def ^:private labels-gen
  "Generates the labels of an internal remapping: up to 3 values with a label each, in the order of the format. No
  label is the text of its value, because no value text starts with an arrow. No two numbers are equal in value."
  (gen/fmap (fn [pairs] (vec (sort-by label-order (map (fn [[v l]] [v (str "\u2192 " l)]) pairs))))
            (gen/vector-distinct-by first
                                    (gen/tuple (gen/one-of [gen/large-integer text-gen gen/boolean (gen/return nil)
                                                            (gen/fmap #(+ 0.5 %) gen/small-integer)])
                                               text-gen)
                                    {:max-elements 3})))

(def ^:private remapping-gen
  "Generates the remapping of a field: a foreign-key remapping to a field, or an internal remapping with or without
  labels."
  (gen/one-of
   [(gen/fmap (fn [[n k]] {:type "external" :name n :field k}) (gen/tuple non-empty-text-gen field-key-gen))
    (gen/fmap (fn [[n labels]] (cond-> {:type "internal" :name n} (seq labels) (assoc :labels labels)))
              (gen/tuple non-empty-text-gen labels-gen))]))

(def ^:private field-settings-gen
  (gen/recursive-gen
   (fn [inner]
     (gen/fmap (fn [[entry children]] (cond-> entry (seq children) (assoc :fields children)))
               (gen/tuple inner (gen/fmap #(into {} %) (gen/vector (gen/tuple (gen/elements [:a :b]) inner) 0 2)))))
   ;; An entry with no setting is not content, so an empty choice becomes one setting.
   (gen/fmap #(if (empty? %) {:visibility_type "hidden"} %)
             (attrs-of {:display_name    [false non-empty-text-gen]
                        :description     [false text-gen]
                        :semantic_type   [false (gen/elements ["type/Currency" "type/FK" "type/Name"])]
                        :visibility_type [false (gen/elements ["hidden" "details-only"])]
                        :fk_target       [false field-key-gen]
                        :settings        [false document-map-gen]
                        :custom_position [false gen/large-integer]
                        :json_unfolding  [false gen/boolean]
                        :remapping       [false remapping-gen]}))))

(def published-table-attrs-gen
  "Generates the `:attrs` of a published table."
  (attrs-of {:description             [false text-gen]
             :entity_type             [false (gen/elements ["entity/GenericTable" "entity/TransactionTable"])]
             :data_layer              [false (gen/elements ["final" "internal" "hidden"])]
             :caveats                 [false text-gen]
             :points_of_interest      [false text-gen]
             :show_in_getting_started [false (gen/return true)]
             :data_authority          [false (gen/elements ["authoritative" "unconfigured"])]
             :owner_email             [false (gen/return "owner@example.com")]
             :fields                  [false (gen/fmap #(into {} %)
                                                       (gen/vector (gen/tuple (gen/elements [:ID :TOTAL :USER_ID])
                                                                              field-settings-gen)
                                                                   1 3))]}))

(def snippet-attrs-gen
  "Generates the `:attrs` of a snippet."
  (attrs-of {:description   [false text-gen]
             :content       [true text-gen]
             :template_tags [false template-tags-gen]}))

(def glossary-attrs-gen
  "Generates the `:attrs` of a glossary term."
  (attrs-of {:definition [true text-gen]}))
(defn- table-definition-gen
  "Generates the definition of a table item: one MBQL stage on a table with the clauses of `clauses-gen`, a map
  generator. The table and the database are placeholders; [[complete]] sets them to the item's place."
  [clauses-gen]
  (gen/fmap (fn [[t clauses]]
              {:lib/type "mbql/query"
               :database "Sample Database"
               :stages   [(merge clauses {:lib/type t :source-table ["Sample Database" "PUBLIC" "ORDERS"]})]})
            (gen/tuple (stage-type-gen "mbql.stage/mbql") clauses-gen)))

(def segment-definition-gen
  "Generates the definition of a segment: filters only."
  (table-definition-gen (gen/fmap (fn [fs] {:filters fs}) (gen/vector filter-gen 1 3))))

(def ^:private measure-aggregation-gen
  (gen/one-of [(gen/return ["count" {}])
               (gen/fmap (fn [r] ["sum" {} r]) field-ref-gen)
               (gen/fmap (fn [id] ["measure" {} id]) lb.tu/entity-id-gen)]))

(def measure-definition-gen
  "Generates the definition of a measure: one aggregation, with no metric."
  (table-definition-gen (gen/fmap (fn [a] {:aggregation [a]}) measure-aggregation-gen)))

(def segment-attrs-gen
  "Generates the `:attrs` of a segment."
  (attrs-of {:description             [false text-gen]
             :points_of_interest      [false text-gen]
             :caveats                 [false text-gen]
             :show_in_getting_started [false (gen/return true)]
             :definition              [true segment-definition-gen]}))

(def measure-attrs-gen
  "Generates the `:attrs` of a measure."
  (attrs-of {:description [false text-gen]
             :definition  [true measure-definition-gen]}))

;;; ---------------------------------------------------- Dashboards ---------------------------------------------------

(def ^:private nested-id-prefix-gen
  "18 characters of an entity id: the ids of the tabs and dashboard cards of one dashboard add 3 more."
  (gen/fmap str/join (gen/vector (gen/elements "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") 18)))

(defn- nested-id
  "The id of the `i`th entry of tag `tag` (one character) of a dashboard whose nested ids start with `prefix`."
  [prefix tag i]
  (format "%s%s%02d" prefix tag i))

(def ^:private dashboard-parameter-gen
  "A dashboard parameter with no id: a plain filter, or a filter whose values come from a card."
  (gen/one-of
   [(gen/fmap (fn [t] {:name "Category" :slug "category" :type t}) (gen/elements ["string/=" "category"]))
    (gen/fmap (fn [[card field]] {:name                 "Category"
                                  :slug                 "category"
                                  :type                 "string/="
                                  :values_source_type   "card"
                                  :values_source_config {:card_id card :value_field field}})
              (gen/tuple lb.tu/entity-id-gen field-ref-gen))]))

(def ^:private dashcard-mapping-gen
  "A parameter mapping of a dashboard card with no parameter id: to a field of its card or of another card."
  (gen/fmap (fn [[card field]] {:card_id card :target ["dimension" field]})
            (gen/tuple lb.tu/entity-id-gen field-ref-gen)))

(def ^:private dashcard-choice-gen
  (attrs-of {:tab                    [true gen/nat]
             :row                    [true (gen/choose 0 20)]
             :col                    [true (gen/choose 0 20)]
             :size_x                 [true (gen/choose 1 24)]
             :size_y                 [true (gen/choose 1 12)]
             :card_id                [false lb.tu/entity-id-gen]
             :action_id              [false lb.tu/entity-id-gen]
             :parameter_mappings     [false (gen/vector dashcard-mapping-gen 1 2)]
             ;; The settings of the shapes that the serdes walk of master reads, so the reference law can compare.
             :visualization_settings [false (gen/fmap first visualization-settings-refs-gen)]
             :series                 [false (gen/vector lb.tu/entity-id-gen 1 2)]
             :inline_parameters      [false (gen/return ["p00"])]}))

(defn- fold-dashboard
  "The dashboard attributes of the choices `attrs`: the nested ids from `prefix`, each dashboard card on the tab of its
  choice (none when the dashboard has no tab), each mapping to a parameter of the dashboard, in the file's order."
  [prefix {:keys [tabs dashcards parameters] :as attrs}]
  (let [tabs       (vec (map-indexed (fn [i tab-name] {:id (nested-id prefix "T" i) :name tab-name}) tabs))
        parameters (vec (map-indexed (fn [i p] (assoc p :id (format "p%02d" i))) parameters))
        param-id   (fn [j] (if (seq parameters) (:id (nth parameters (mod j (count parameters)))) "p00"))
        dashcards  (vec (map-indexed
                         (fn [i {:keys [tab] :as dc}]
                           (cond-> (-> dc (dissoc :tab) (assoc :id (nested-id prefix "C" i)))
                             (seq tabs)                   (assoc :dashboard_tab_id (:id (nth tabs (mod tab (count tabs)))))
                             (:parameter_mappings dc)     (update :parameter_mappings
                                                                  (fn [ms] (vec (map-indexed #(assoc %2 :parameter_id (param-id %1)) ms))))))
                         dashcards))]
    (cond-> (dissoc attrs :tabs :dashcards :parameters)
      (seq tabs)       (assoc :tabs tabs)
      (seq parameters) (assoc :parameters parameters)
      (seq dashcards)  (assoc :dashcards (dashboard/dashcard-order tabs (mapv dashboard/normal-dashcard dashcards))))))

(def dashboard-attrs-gen
  "Generates the `:attrs` of a dashboard: its own attributes, parameters, tabs, and dashboard cards on those tabs with
  every entry that holds a reference."
  (gen/fmap (fn [[prefix attrs]] (fold-dashboard prefix attrs))
            (gen/tuple nested-id-prefix-gen
                       (attrs-of {:description             [false text-gen]
                                  :caveats                 [false text-gen]
                                  :points_of_interest      [false text-gen]
                                  :collection_position     [false gen/large-integer]
                                  :position                [false gen/large-integer]
                                  :width                   [false (gen/return "full")]
                                  :auto_apply_filters      [false (gen/return false)]
                                  :show_in_getting_started [false (gen/return true)]
                                  :parameters              [false (gen/vector dashboard-parameter-gen 1 2)]
                                  :tabs                    [false (gen/vector non-empty-text-gen 1 2)]
                                  :dashcards               [false (gen/vector dashcard-choice-gen 1 3)]}))))

(def attrs-gens
  "`{kind generator}` of the `:attrs` of each kind."
  {:collection      collection-attrs-gen
   :dashboard       dashboard-attrs-gen
   :glossary-term   glossary-attrs-gen
   :measure         measure-attrs-gen
   :metric          metric-attrs-gen
   :model           model-attrs-gen
   :published-table published-table-attrs-gen
   :question        question-attrs-gen
   :segment         segment-attrs-gen
   :snippet         snippet-attrs-gen})

(def table-item-kinds
  "The kinds whose items live on a published table."
  #{:measure :segment})

;;; ---------------------------------------------------- Snapshots ---------------------------------------------------

(defn with-refs
  "Snapshot `s` with the references of each item derived from its identity and attributes by its codec."
  [s]
  (into {}
        (map (fn [[id item]] [id (assoc item :refs (kinds/refs (:kind item) id (:attrs item)))]))
        s))

(defn on-their-tables
  "Snapshot `s` with the definition of each table item (a segment or a measure) on the table of its place, which is
  a table key."
  [s]
  (update-vals s (fn [{:keys [kind place] :as item}]
                   (if (contains? table-item-kinds kind)
                     (update-in item [:attrs :definition] #(-> %
                                                               (assoc :database (first place))
                                                               (assoc-in [:stages 0 :source-table] place)))
                     item))))

(def ^:private area-of-kind
  "The area of the top-level items of each kind that is in an area by its kind alone."
  {:glossary-term :glossary
   :snippet       :snippets})

(defn in-areas
  "Snapshot `s` in which each item at the root level that belongs to an area has the area root as its place
  (`snapshot/area-root`): a glossary term, a snippet, and a collection of a namespace. The Library collection, and a
  collection of no namespace, stay at the root level."
  [s]
  (update-vals s (fn [{:keys [kind place attrs] :as item}]
                   (if-some [area (when (nil? place)
                                    (or (area-of-kind kind)
                                        (when (= :collection kind) (some-> (:namespace attrs) keyword))))]
                     (assoc item :place (snapshot/area-root area))
                     item))))

(def complete
  "[[with-refs]] of [[on-their-tables]] of [[in-areas]]."
  (comp with-refs on-their-tables in-areas))

(defn snapshot-gen
  "Generates well-formed snapshots of the kinds, at most `max-items` (default 30) items, whose items fit the schemas
  of their codecs. A segment or a measure is on a published table, never at the root level. A glossary term, a snippet
  at the top level and a collection of a namespace at the top level are at their area roots ([[in-areas]]). The
  references of an item are those of its attributes; they can name items that are not in the snapshot."
  ([] (snapshot-gen 30))
  ([max-items]
   (gen/fmap complete
             (lb.tu/well-formed-snapshot-gen {:kinds       snapshot/kinds
                                              :may-contain snapshot/may-contain
                                              :root-kinds  (apply disj snapshot/kinds table-item-kinds)
                                              :attrs       attrs-gens
                                              :max-items   max-items}))))
