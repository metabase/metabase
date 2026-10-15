(ns metabase-enterprise.library-branching.format.kinds-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.common :as common]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io File)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(def ^:private by-kind (codec/by-kind kinds/codecs))

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- text ^String [^bytes b] (String. b "UTF-8"))

(defn- text-tree [t] (update-vals t text))

(defn- scramble
  "Equal to `x`, with every map built in a different order."
  [x]
  (cond
    (map? x)    (apply array-map (mapcat (fn [[k v]] [(scramble k) (scramble v)]) (reverse (seq x))))
    (set? x)    (into (sorted-set-by #(compare (pr-str %2) (pr-str %1))) (map scramble) x)
    (vector? x) (mapv scramble x)
    :else       x))

(defn- fits-schema? [id {:keys [kind] :as item}]
  (and (mr/validate (codec/schema (get by-kind kind)) item)
       (mr/validate ::snapshot/snapshot {id item})))

;;; ------------------------------------------------------ Codecs -----------------------------------------------------

(deftest codecs-test
  (testing "one codec for each kind of the snapshot"
    (is (= snapshot/kinds (set (keys by-kind)))))
  (testing "the words and directory kinds of the layout"
    (is (= {:collection ["collection" true] :glossary-term ["term" false] :measure ["measure" false]
            :metric ["metric" false] :model ["model" false] :published-table ["table" false]
            :question ["question" false] :segment ["segment" false] :snippet ["snippet" false]}
           (update-vals by-kind (juxt layout/word layout/directory?))))))

;;; ------------------------------------------------------ Laws -------------------------------------------------------

(defspec generated-items-fit-their-schemas-test 200
  (prop/for-all [s (kinds.tu/snapshot-gen)]
    (and (mr/validate ::snapshot/snapshot s)
         (every? (fn [[id item]] (fits-schema? id item)) s))))

(defspec item-round-trip-test 300
  ;; decode(encode(c)) = c, through the bytes of the file.
  (prop/for-all [s (kinds.tu/snapshot-gen 10)]
    (every? (fn [[id {:keys [kind] :as item}]]
              (let [c (get by-kind kind)]
                (= [id item] (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c id item)))))))
            s)))

(defspec tree-round-trip-test 200
  (prop/for-all [s (kinds.tu/snapshot-gen)]
    (= {:snapshot s} (tree/decode-tree kinds/codecs (vals (writer/encode-tree kinds/codecs s))))))

(defspec path-law-test 200
  ;; Alloy DecodeIgnoresPaths: the files as a flat list `<n>.yaml`, in a random order, decode to the same snapshot.
  (prop/for-all [[s order] (gen/bind (kinds.tu/snapshot-gen)
                                     (fn [s] (gen/tuple (gen/return s) (gen/shuffle (range (inc (count s)))))))]
    (let [files (vec (vals (writer/encode-tree kinds/codecs s)))
          flat  (into {} (map-indexed (fn [n i] [(str n ".yaml") (nth files i)])) order)]
      (= {:snapshot s} (tree/decode-tree kinds/codecs (vals flat))))))

(defspec canonical-bytes-test 200
  ;; Equal content gives equal bytes, whatever the order of the maps and sets of the input.
  (prop/for-all [s (kinds.tu/snapshot-gen)]
    (= (text-tree (writer/encode-tree kinds/codecs s))
       (text-tree (writer/encode-tree (reverse kinds/codecs) (scramble s))))))

(defspec unique-paths-test 200
  ;; Alloy UniquePaths, with the homes of the four kinds.
  (prop/for-all [s (kinds.tu/snapshot-gen)]
    (let [paths (vals (layout/layout kinds/codecs s))]
      (or (empty? paths) (apply distinct? paths)))))

(deftest snapshot-gen-coverage-test
  (testing "the generator gives the cases that the laws must cover"
    (let [ss    (mapv #(gen/generate (kinds.tu/snapshot-gen) 30 %) (range 100))
          items (mapcat vals ss)
          trees (mapv #(text-tree (writer/encode-tree kinds/codecs %)) ss)
          paths (mapcat keys trees)
          texts (mapcat vals trees)]
      (is (= snapshot/kinds (set (map :kind items))) "every kind")
      (doseq [prefix ["library/_collection.yaml" "snippets/" "transforms/" "actions/" "apps/" "glossary/"]]
        (is (some #(str/starts-with? % prefix) paths) prefix))
      (is (some #(re-find #"\.table\.yaml$" %) paths) "a published table")
      (is (some #(re-find #"\.table/[^/]+\.segment\.yaml$" %) paths) "a segment in the directory of its table")
      (is (some #(re-find #"\.table/[^/]+\.measure\.yaml$" %) paths) "a measure in the directory of its table")
      (is (some #(some (fn [[role]] (= :segment role)) (:refs %)) items) "a reference to a segment")
      (is (some #(some (fn [[role]] (= :measure role)) (:refs %)) items) "a reference to a measure")
      (is (some #(str/includes? % "~") paths) "an identity suffix")
      (is (some #(str/includes? % "native:") texts) "a native stage")
      (is (some #(str/includes? % "joins:") texts) "a join")
      (is (some #(str/includes? % "lib/type: mbql.stage/other") texts) "a stage type that its structure does not imply")
      (is (some #(str/includes? % "template_tags:") texts) "template tags")
      (is (some #(get-in % [:attrs :fields]) items) "field settings")
      (is (some #(some (comp :fields val) (get-in % [:attrs :fields])) items) "a nested field")
      (is (some #(some (fn [[role]] (= :fk-target role)) (:refs %)) items) "a foreign-key target")
      (is (some #(some (fn [[role]] (= :remapping role)) (:refs %)) items) "a foreign-key remapping")
      (let [remappings (into []
                             (comp (mapcat #(tree-seq coll? seq (get-in % [:attrs :fields])))
                                   (keep #(when (map? %) (:remapping %))))
                             items)]
        (is (some #(and (= "internal" (:type %)) (:labels %)) remappings) "an internal remapping with labels")
        (is (some #(and (= "internal" (:type %)) (not (:labels %))) remappings) "an internal remapping with no labels"))
      (is (some #(< 3 (count (:refs %))) items) "an item with several references"))))

;;; ---------------------------------------------------- Golden files -------------------------------------------------

(def ^:private golden-dir "enterprise/backend/test_resources/library_branching/golden")

(defn- read-dir
  "`{path bytes}` of every file under directory `dir`, with relative paths separated by /."
  [dir]
  (let [root (.toPath (io/file dir))]
    (into {}
          (comp (filter #(.isFile ^File %))
                (map (fn [^File f]
                       [(str/replace (str (.relativize root (.toPath f))) File/separator "/")
                        (Files/readAllBytes (.toPath f))])))
          (file-seq (io/file dir)))))

(def ^:private sd "Sample Database")
(def ^:private library-id "LiBrArYcOlLeCtIoN0001")
(def ^:private data-id "dAtAcOlLeCtIoNiD00000")
(def ^:private metrics-id "mEtRiCsCoLlEcTiOnId00")
(def ^:private revenue-id "cOlQuErIeS0ExAmPlE2x1")
(def ^:private total-revenue-id "IW8kbqZVaMxdGtCM2F4U6")
(def ^:private revenue-by-month-id "Qx81tWm0aLpN2ZcB7yYgr")
(def ^:private filters-id "sNiPpEtFiLtErScOlL001")
(def ^:private base-filter-id "bAsEfIlTeRsNiPpEt0001")
(def ^:private active-filter-id "aCtIvEpRoDuCtFiLtEr01")
(def ^:private finance-id "fInAnCeCoLlEcTiOnId00")
(def ^:private churn-id "ChUrNgLoSsArYtErM0001")
(def ^:private orders [sd "PUBLIC" "ORDERS"])
(def ^:private large-orders-id "lArGeOrDeRsSeGmEnT001")
(def ^:private order-total-id "oRdErToTaLmEaSuRe0001")

(defn- collection [nm place & {:as attrs}]
  {:kind :collection :name nm :place place :refs #{} :attrs (or attrs {})})

(def ^:private golden-snapshot
  "The items of the examples of the format design (ARCHITECTURE.md section 10.3), with the parents that they name."
  {library-id  (collection "Library" nil :type "library")
   data-id     (collection "Data" library-id :type "library-data")
   metrics-id  (collection "Metrics" library-id :type "library-metrics")
   revenue-id  (collection "Revenue" metrics-id :description "Revenue metrics that finance signs off on.")
   filters-id  (collection "Filters" nil :namespace "snippets")
   finance-id  (collection "Finance" nil :namespace "transforms")

   total-revenue-id
   {:kind  :metric
    :name  "Total Revenue"
    :place revenue-id
    :refs  #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:field [:env [sd "PUBLIC" "ORDERS" "TOTAL"]]]}
    :attrs {:description "Sum of order totals, after discounts."
            :display     "scalar"
            :query       {:lib/type "mbql/query"
                          :database sd
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table orders
                                      :aggregation  [["sum" {} ["field" {:base-type "type/Float"}
                                                                [sd "PUBLIC" "ORDERS" "TOTAL"]]]]}]}}}

   revenue-by-month-id
   {:kind  :metric
    :name  "Total Revenue"
    :place revenue-id
    :refs  #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:source-table [:env [sd "PUBLIC" "PRODUCTS"]]]
             [:field [:env [sd "PUBLIC" "ORDERS" "PRODUCT_ID"]]]
             [:field [:env [sd "PUBLIC" "PRODUCTS" "ID"]]]
             [:field [:env [sd "PUBLIC" "ORDERS" "CREATED_AT"]]]
             [:metric total-revenue-id]}
    :attrs {:display                "line"
            :collection_preview     false
            :visualization_settings {:graph.dimensions ["CREATED_AT"] :graph.metrics ["count"]}
            :query
            {:lib/type "mbql/query"
             :database sd
             :stages   [{:lib/type     "mbql.stage/mbql"
                         :source-table orders
                         :joins        [{:lib/type   "mbql/join"
                                         :alias      "Products"
                                         :fields     "all"
                                         :stages     [{:lib/type     "mbql.stage/mbql"
                                                       :source-table [sd "PUBLIC" "PRODUCTS"]}]
                                         :conditions [["=" {}
                                                       ["field" {:base-type "type/Integer"}
                                                        [sd "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                                       ["field" {:base-type "type/BigInteger" :join-alias "Products"}
                                                        [sd "PUBLIC" "PRODUCTS" "ID"]]]]}]
                         :aggregation  [["metric" {} total-revenue-id]]
                         :breakout     [["field" {:base-type "type/DateTime" :temporal-unit "month"}
                                         [sd "PUBLIC" "ORDERS" "CREATED_AT"]]]}
                        {:lib/type "mbql.stage/mbql"
                         :filters  [[">" {} ["field" {:base-type "type/Float"} "count"] 10]]}]}}}

   orders
   {:kind  :published-table
    :name  "Orders"
    :place data-id
    :refs  #{[:table [:env orders]]
             [:field [:env [sd "PUBLIC" "ORDERS" "TOTAL"]]]
             [:field [:env [sd "PUBLIC" "ORDERS" "USER_ID"]]]
             [:fk-target [:env [sd "PUBLIC" "PEOPLE" "ID"]]]}
    :attrs {:description "One row per order."
            :fields      {:TOTAL   {:display_name "Total" :semantic_type "type/Currency"}
                          :USER_ID {:visibility_type "hidden" :fk_target [sd "PUBLIC" "PEOPLE" "ID"]}}}}

   large-orders-id
   {:kind  :segment
    :name  "Large orders"
    :place orders
    :refs  #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:field [:env [sd "PUBLIC" "ORDERS" "TOTAL"]]]}
    :attrs {:description "Orders over 100."
            :definition  {:lib/type "mbql/query"
                          :database sd
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table orders
                                      :filters      [[">" {} ["field" {:base-type "type/Float"}
                                                              [sd "PUBLIC" "ORDERS" "TOTAL"]]
                                                      100]]}]}}}

   order-total-id
   {:kind  :measure
    :name  "Order total"
    :place orders
    :refs  #{[:database [:env [sd]]]
             [:source-table [:env orders]]
             [:field [:env [sd "PUBLIC" "ORDERS" "TOTAL"]]]
             [:segment large-orders-id]}
    :attrs {:definition {:lib/type "mbql/query"
                         :database sd
                         :stages   [{:lib/type     "mbql.stage/mbql"
                                     :source-table orders
                                     :aggregation  [["sum-where" {}
                                                     ["field" {:base-type "type/Float"} [sd "PUBLIC" "ORDERS" "TOTAL"]]
                                                     ["segment" {} large-orders-id]]]}]}}}

   base-filter-id
   {:kind :snippet :name "Base filter" :place nil :refs #{} :attrs {:content "products.deleted_at IS NULL"}}

   churn-id
   {:kind  :glossary-term
    :name  "Churn"
    :place nil
    :refs  #{}
    :attrs {:definition "The share of customers who cancel in a month."}}

   active-filter-id
   {:kind  :snippet
    :name  "Active product filter"
    :place filters-id
    :refs  #{[:snippet base-filter-id]}
    :attrs {:description   "Products that are for sale."
            :content       "products.active = true AND price > {{min_price}} AND {{snippet: Base filter}}"
            :template_tags {(keyword "snippet: Base filter") {:type         "snippet"
                                                              :name         "snippet: Base filter"
                                                              :display-name "Base filter"
                                                              :snippet-name "Base filter"
                                                              :snippet-id   base-filter-id
                                                              :id           "0b1d6e0e-6c55-4c1a-9a43-6d5a8b2f6a11"}
                            :min_price                       {:type         "number"
                                                              :name         "min_price"
                                                              :display-name "Min price"
                                                              :id           "5f0a3c55-1f0b-4e0e-8c62-2b8f8a9e7d20"}}}}})

(deftest golden-tree-test
  (let [files (read-dir golden-dir)]
    (testing "the golden snapshot is a snapshot whose items fit their schemas"
      (is (every? (fn [[id item]] (fits-schema? id item)) golden-snapshot)))
    (testing "the golden files decode to the golden snapshot"
      (is (= {:snapshot golden-snapshot} (tree/decode-tree kinds/codecs (vals files)))))
    (testing "the golden snapshot encodes to the golden files: the same paths and the same bytes"
      (is (= (text-tree files) (text-tree (writer/encode-tree kinds/codecs golden-snapshot)))))
    (testing "a file holds no :lib/type that the structure of the query implies"
      (is (not-any? #(str/includes? % "lib/type") (vals (text-tree files)))))))

;;; ---------------------------------------------------- The rules of every kind --------------------------------------

(def ^:private metric-doc
  "kind: metric\nid: IW8kbqZVaMxdGtCM2F4U6\ndisplay: scalar\nname: Total Revenue\nquery:\n  database: Sample Database\n  stages:\n  - source-table: [Sample Database, PUBLIC, ORDERS]\n")

(defn- decode-text [s]
  (let [doc (codec/read-yaml (utf-8 s))]
    (codec/decode (get by-kind (keyword (:kind doc))) doc)))

(defn- invalid? [s]
  (try
    (decode-text s)
    false
    (catch clojure.lang.ExceptionInfo e
      (= ::codec/invalid (:type (ex-data e))))))

(deftest instance-local-attributes-test
  ;; Q5: public links and embedding settings are not content: no item holds them, and a file with them is invalid.
  (doseq [k [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type :entity_id
             :created_at :updated_at :creator_id :archived :result_metadata :card_schema]
          [kind item] [[:metric (get golden-snapshot total-revenue-id)]
                       [:question (assoc (get golden-snapshot total-revenue-id) :kind :question)]
                       [:collection (get golden-snapshot revenue-id)]
                       [:snippet (get golden-snapshot base-filter-id)]
                       [:published-table (get golden-snapshot orders)]
                       [:glossary-term (get golden-snapshot churn-id)]
                       [:segment (get golden-snapshot large-orders-id)]
                       [:measure (get golden-snapshot order-total-id)]]]
    (testing (str kind " with " k)
      (is (not (mr/validate (codec/schema (get by-kind kind)) (assoc-in item [:attrs k] "x"))))))
  (testing "a metric file with a public link or the embedding settings is invalid, and decode-tree reports it"
    (doseq [line ["public_uuid: 9d6f1c22-38d4-4c6e-b9a2-1b2f0a0d5e11\n" "enable_embedding: true\n"
                  "embedding_params: {category: enabled}\n"]]
      (is (invalid? (str metric-doc line)))
      (is (= [:invalid] (mapv :type (:findings (tree/decode-tree kinds/codecs [(utf-8 "format: library-branching/1\n")
                                                                               (utf-8 (str metric-doc line))]))))))))

(deftest defaults-test
  (testing "an absent attribute decodes to its default, which is not in :attrs"
    (is (= [total-revenue-id {:kind  :metric :name "Total Revenue" :place nil
                              :refs  #{[:database [:env [sd]]] [:source-table [:env orders]]}
                              :attrs {:display "scalar"
                                      :query   {:lib/type "mbql/query"
                                                :database sd
                                                :stages   [{:lib/type "mbql.stage/mbql" :source-table orders}]}}}]
           (decode-text metric-doc))))
  (testing "an attribute written at its default decodes as if it were absent"
    (doseq [line ["description: null\n" "collection_preview: true\n" "visualization_settings: {}\n"
                  "parameters: []\n" "collection: null\n"]]
      (is (= (decode-text metric-doc) (decode-text (str metric-doc line))) line)))
  (testing "an item with an attribute at its default does not fit the schema"
    (doseq [[k v] [[:description nil] [:collection_preview true] [:visualization_settings {}] [:parameters []]]]
      (is (not (mr/validate (codec/schema (:metric by-kind))
                            (assoc-in (get golden-snapshot total-revenue-id) [:attrs k] v)))
          (str k)))))

(deftest required-attributes-test
  (testing "a glossary term needs a definition"
    (is (not (mr/validate (codec/schema (:glossary-term by-kind))
                          (update (get golden-snapshot churn-id) :attrs dissoc :definition)))))
  (testing "a metric needs a display and a query; a snippet needs content"
    (is (not (mr/validate (codec/schema (:metric by-kind))
                          (update (get golden-snapshot total-revenue-id) :attrs dissoc :display))))
    (is (not (mr/validate (codec/schema (:metric by-kind))
                          (-> (get golden-snapshot total-revenue-id)
                              (update :attrs dissoc :query)
                              (assoc :refs #{})))))
    (is (not (mr/validate (codec/schema (:snippet by-kind))
                          (update (get golden-snapshot base-filter-id) :attrs dissoc :content))))))

(deftest invalid-documents-test
  (testing "decode throws ::codec/invalid for a document that is not of the kind"
    (are [s] (invalid? s)
      ;; an unknown key
      (str metric-doc "colour: blue\n")
      ;; an identity that does not fit the kind
      (str/replace metric-doc "id: IW8kbqZVaMxdGtCM2F4U6" "id: [Sample Database, PUBLIC, ORDERS]")
      "kind: published-table\nid: IW8kbqZVaMxdGtCM2F4U6\ndisplay_name: Orders\n"
      "kind: collection\nname: No id\n"
      ;; no name, or an empty one
      "kind: collection\nid: cOlQuErIeS0ExAmPlE2x1\n"
      "kind: collection\nid: cOlQuErIeS0ExAmPlE2x1\nname: ''\n"
      "kind: published-table\nid: [Sample Database, PUBLIC, ORDERS]\nname: Orders\n"))
  (testing "a valid document decodes"
    (is (not (invalid? metric-doc)))
    (is (not (invalid? "kind: published-table\nid: [Sample Database, null, ORDERS]\ndisplay_name: Orders\n")))))

(deftest references-test
  (testing "the schema refuses an item whose references are not those of its attributes"
    (let [item (get golden-snapshot total-revenue-id)]
      (is (not (mr/validate (codec/schema (:metric by-kind)) (update item :refs conj [:card revenue-id]))))
      (is (not (mr/validate (codec/schema (:metric by-kind)) (update item :refs disj [:database [:env [sd]]]))))))
  (testing "kinds/refs gives the references of each golden item"
    (doseq [[id {:keys [kind refs attrs]}] golden-snapshot]
      (is (= refs (kinds/refs kind id attrs)) (str id)))))

(deftest document-value-test
  (testing "document? holds for the values that the YAML reader gives back equal"
    (are [x] (common/document? x)
      nil "s" 1 -1.5 true {} [] {:a [1 {:b nil}]} {:lib/type "x"} (bigint 1e30)))
  (testing "document? fails for a value that the YAML reader cannot give back equal"
    (are [x] (not (common/document? x))
      :k #{1} {"a" 1} '(1) ##NaN {:a :b} [1 :x] (keyword "a/b" "c"))))

;;; ---------------------------------------------------- Mutations ----------------------------------------------------

(def ^:private mutations
  [{:name   :defaults-kept
    :doc    "Decode keeps an attribute written at its default, so one item has two forms and a diff shows a change."
    :target `common/drop-defaults
    :edits  [[:replace '(at-default? spec k v) false]]}
   {:name   :unknown-keys-allowed
    :doc    "Decode ignores a key that is not an attribute of the kind, so a typo or an instance-local attribute is
            lost in silence."
    :target `common/decode-doc
    :edits  [[:replace '(seq unknown) nil]]}
   {:name   :identity-unchecked
    :doc    "Decode accepts an identity of another kind's form, so a metric can have a table key."
    :target `common/decode-doc
    :edits  [[:replace '(registry/validate id-schema id) true]]}
   {:name   :name-unchecked
    :doc    "Decode accepts a file with no name."
    :target `common/decode-doc
    :edits  [[:replace '(and (string? nm) (seq nm)) true]]}
   {:name   :place-dropped
    :doc    "Encode does not write the place, so decode cannot rebuild the container (Alloy PlaceFromDirectoryFails)."
    :target `common/encode-item
    :edits  [[:replace '(some? place) false]]}
   {:name   :refs-unchecked
    :doc    "The schema does not check the references against the attributes, so the engine can see stale refs."
    :target `common/refs-consistent?
    :edits  [[:replace '(= refs (refs-of spec id attrs)) true]]}])

(deftest kinds-mutations-test
  (mut/check mutations {:tests [#'defaults-test #'invalid-documents-test #'references-test #'golden-tree-test
                                #'instance-local-attributes-test]}))
