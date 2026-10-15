(ns metabase-enterprise.library-branching.format.kinds.test-util
  "test.check generators of the `:attrs` of each kind, and of snapshots of the four kinds whose items fit the schemas
  of their codecs.

  Each generator is constructive: it builds a value of the content schema from random choices, filters nothing, and
  never gives an attribute at its default value. An optional attribute is absent or present; absent is the first
  choice, so a shrunk value has few attributes."
  (:require
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

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

;;; ---------------------------------------------------- Attributes ---------------------------------------------------

(def collection-attrs-gen
  "Generates the `:attrs` of a collection."
  (attrs-of {:description     [false text-gen]
             :type            [false (gen/elements ["library" "library-data" "library-metrics" "library-dashboards"])]
             :namespace       [false (gen/elements ["snippets" "transforms" "data-actions" "data-apps"])]
             :authority_level [false (gen/return "official")]}))

(def metric-attrs-gen
  "Generates the `:attrs` of a metric."
  (attrs-of {:description            [false text-gen]
             :display                [true (gen/elements ["scalar" "line" "bar" "table"])]
             :query                  [true query-gen]
             :visualization_settings [false document-map-gen]
             :parameters             [false (gen/vector document-map-gen 1 2)]
             :parameter_mappings     [false (gen/vector document-map-gen 1 2)]
             :collection_position    [false gen/large-integer]
             :collection_preview     [false (gen/return false)]
             :dimensions             [false (gen/vector document-map-gen 0 2)]
             :dimension_mappings     [false (gen/vector document-map-gen 0 2)]}))

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
                        :json_unfolding  [false gen/boolean]}))))

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

(def attrs-gens
  "`{kind generator}` of the `:attrs` of each kind."
  {:collection      collection-attrs-gen
   :metric          metric-attrs-gen
   :published-table published-table-attrs-gen
   :snippet         snippet-attrs-gen})

;;; ---------------------------------------------------- Snapshots ---------------------------------------------------

(defn with-refs
  "Snapshot `s` with the references of each item derived from its identity and attributes by its codec."
  [s]
  (into {}
        (map (fn [[id item]] [id (assoc item :refs (kinds/refs (:kind item) id (:attrs item)))]))
        s))

(defn snapshot-gen
  "Generates well-formed snapshots of the four kinds, at most `max-items` (default 30) items, whose items fit the
  schemas of their codecs. The references of an item are those of its attributes; they can name items that are not
  in the snapshot."
  ([] (snapshot-gen 30))
  ([max-items]
   (gen/fmap with-refs
             (lb.tu/well-formed-snapshot-gen {:kinds       snapshot/kinds
                                              :may-contain snapshot/may-contain
                                              :root-kinds  snapshot/kinds
                                              :attrs       attrs-gens
                                              :max-items   max-items}))))
