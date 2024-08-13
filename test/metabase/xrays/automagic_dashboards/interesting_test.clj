(ns ^:mb/once metabase.xrays.automagic-dashboards.interesting-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card Field]]
   [metabase.models.interface :as mi]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.test :as mt]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [metabase.xrays.automagic-dashboards.interesting :as interesting]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]))

;;; ------------------- `->reference` -------------------

(deftest ^:parallel ->reference-test
  (is (= [:field 1 nil]
         (->> (assoc (mi/instance Field) :id 1)
              (#'interesting/->reference :mbql))))

  (is (= [:field 2 {:source-field 1}]
         (->> (assoc (mi/instance Field) :id 1 :fk_target_field_id 2)
              (#'interesting/->reference :mbql))))
  (is (= 42
         (->> 42
              (#'interesting/->reference :mbql)))))

;;; -------------------- Bind dimensions, candidate bindings, field candidates, and related --------------------


(defn field [table column]
  (or (t2/select-one Field :id (mt/id table column))
      (throw (ex-info (format "Did not find %s.%s" (name table) (name column))
                      {:table table :column column}))))

(deftest ^:parallel field-matching-predicates-test
  (testing "The fieldspec-matcher does not match on ID columns."
    (mt/dataset test-data
      (let [id-field (field :products :id)]
        ;; the id-field does have a type...
        (is (true? (magic.util/field-isa? id-field :type/*)))
        ;; ...but it isn't a candidate dimension because it is an id column...
        (is (false? ((#'interesting/fieldspec-matcher :type/*) id-field)))
        ;; ...unless you're looking explicitly for a primary key
        (is (true? ((#'interesting/fieldspec-matcher :type/PK) id-field))))))
  (testing "The fieldspec-matcher should match fields by their fieldspec"
    (mt/dataset test-data
      (let [price-field (field :products :price)
            latitude-field (field :people :latitude)
            created-at-field (field :people :created_at)
            pred (#'interesting/fieldspec-matcher :type/Latitude)]
        (is (false? (pred price-field)))
        (is (true? (pred latitude-field)))
        (is (true? ((#'interesting/fieldspec-matcher :type/CreationTimestamp) created-at-field)))
        (is (true? ((#'interesting/fieldspec-matcher :type/*) created-at-field))))))
  (testing "The name-regex-matcher should return fields with string/regex matches"
    (mt/dataset test-data
      (let [price-field (field :products :price)
            category-field (field :products :category)
            ice-pred (#'interesting/name-regex-matcher "ice")]
        (is (some? (ice-pred price-field)))
        (is (nil? (ice-pred category-field))))))
  (testing "The max-cardinality-matcher should return fields with cardinality <= the specified cardinality"
    (mt/dataset test-data
      (let [category-field (field :products :category)]
        (is (false? ((#'interesting/max-cardinality-matcher 3) category-field)))
        (is (true? ((#'interesting/max-cardinality-matcher 4) category-field)))
        (is (true? ((#'interesting/max-cardinality-matcher 100) category-field))))))
  (testing "Roll the above together and test filter-fields"
    (mt/dataset test-data
      (let [category-field (field :products :category)
            price-field (field :products :price)
            latitude-field (field :people :latitude)
            created-at-field (field :people :created_at)
            source-field (field :people :source)
            fields [category-field price-field latitude-field created-at-field source-field]]
        ;; Get the lone field that is both a CreationTimestamp and has "at" in the name
        (is (= #{(mt/id :people :created_at)}
               (set (map :id (#'interesting/filter-fields
                              {:fieldspec :type/CreationTimestamp
                               :named "at"}
                              fields)))))
        ;; Get all fields with "at" in their names
        (is (= #{(mt/id :products :category)
                 (mt/id :people :created_at)
                 (mt/id :people :latitude)}
               (set (map :id (#'interesting/filter-fields {:named "at"} fields)))))
        ;; Products.Category has cardinality 4 and People.Source has cardinality 5
        ;; Both are picked up here
        (is (= #{(mt/id :products :category)
                 (mt/id :people :source)}
               (set (map :id (#'interesting/filter-fields {:max-cardinality 5} fields)))))
        ;; People.Source is rejected here
        (is (= #{(mt/id :products :category)}
               (set (map :id (#'interesting/filter-fields {:max-cardinality 4} fields)))))))))

(deftest ^:parallel field-candidates-with-tablespec-specialization
  (testing "Test for when both a tablespec and fieldspec are provided in the dimension definition"
    (let [matching-field           {:name          "QUANTITY BUT NAME DOES NOT MATTER"
                                    :semantic_type :type/Quantity}
          non-matching-field       {:name          "QUANTITY IS MY NAME, BUT I AM A GENERIC NUMBER"
                                    :semantic_type :type/GenericNumber}
          context                  {:tables
                                    [{:entity_type :entity/GenericTable
                                      :fields      [matching-field
                                                    non-matching-field]}]}
          gt-quantity-dimension    {:field_type [:entity/GenericTable :type/Quantity], :score 100}
          generic-number-dimension {:field_type [:type/GenericNumber], :score 100}
          quantity-dimension       {:field_type [:type/Quantity], :score 100}]
      (testing "A match occurs when the dimension field_type tablespec and fieldspec
                match the table entity_type and field semantic_type."
        (is (=? [matching-field]
                (#'interesting/matching-fields
                 context
                 gt-quantity-dimension))))
      (testing "When the table entity_type does not match the dimension, nothing is returned."
        (is (empty? (#'interesting/matching-fields
                     (assoc-in context [:tables 0 :entity_type] :entity/Whatever)
                     gt-quantity-dimension))))
      (testing "When the dimension spec does not contain a table spec and no :source is provided
                in the context nothing is returned."
        (is (empty? (#'interesting/matching-fields
                     context
                     generic-number-dimension))))
      (testing "Even if the field and dimension semantic types match, a match will not occur without a table spec."
        (is (empty? (#'interesting/matching-fields
                     context
                     quantity-dimension)))))))

(deftest ^:parallel field-candidates-with-no-tablespec-specialization
  (testing "Tests for when only a fieldspec is provided in the dimension definition.
            The expectation is a `source` will be provided with populated fields."
    (let [quantity-field           {:name          "QUANTITY BUT NAME DOES NOT MATTER"
                                    :semantic_type :type/Quantity}
          generic-number-field     {:name          "QUANTITY IS MY NAME, BUT I AM A GENERIC NUMBER"
                                    :semantic_type :type/GenericNumber}
          another-field            {:name          "X"
                                    :semantic_type :type/GenericNumber}
          context                  {:source
                                    {:fields [quantity-field
                                              generic-number-field]}}
          quantity-dimension       {:field_type [:type/Quantity], :score 100}
          gt-quantity-dimension    {:field_type [:entity/GenericTable :type/Quantity], :score 100}
          generic-number-dimension {:field_type [:type/GenericNumber], :score 100}]
      (testing "A match occurs when the dimension field_type tablespec and fieldspec
                match the table entity_type and field semantic_type."
        (is (=? [quantity-field]
                (#'interesting/matching-fields
                 context
                 quantity-dimension))))
      (testing "When a table spec is provided in the dimension and the source contains no tables there is no match."
        (is (empty? (#'interesting/matching-fields
                     context
                     gt-quantity-dimension))))
      (testing "Multiple fields of the same type will match"
        (is (=? [generic-number-field
                 another-field]
                (#'interesting/matching-fields
                 (update-in context [:source :fields] conj another-field)
                 generic-number-dimension)))))))

(deftest ^:parallel candidate-bindings-1f-3b-test
  (testing "Candidate bindings with one field and multiple bindings"
    (let [field                {:base_type     :type/Integer
                                :name          "QUANTITY"
                                :semantic_type :type/Quantity}
          context              {:tables
                                [{:entity_type :entity/GenericTable
                                  :fields      [field]}]}
          generic-number-dim   {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          generic-quantity-dim {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim        {"Quantity no table" {:field_type [:type/Quantity], :score 100}}
          dimensions           [generic-number-dim
                                generic-quantity-dim
                                unmatched-dim]
          bindings             (vals (#'interesting/candidate-bindings context dimensions))]
      (testing "The single field binds to the two relevant dimensions"
        (is (=? [[generic-number-dim
                  generic-quantity-dim]]
                bindings)))
      (testing "The single field binds only to those two dimensions and not the unmatched dim"
        (is (= 2 (count (first bindings))))))))

(deftest ^:parallel candidate-bindings-2f-4d-test
  (testing "Candidate bindings with multiple fields and bindings"
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (#'interesting/candidate-bindings context dimensions)]
      (testing "2 results are returned - one for each matched field group"
        (is (= 2 (count bindings))))
      (testing "The return data shape is a vector for each field, each of which is a vector of
                each matching dimension, each of which as associated a `:matches` into the
                value of the dimension map."
        (is (=? (apply
                 merge
                 (for [{field-name :name :as field} [nurnies greebles]]
                   {field-name
                    (for [dimension [integer-dim number-dim quantity-dim]]
                      (update-vals dimension #(assoc % :matches [field])))}))
                bindings))))))

(deftest ^:parallel candidate-bindings-3f-4d-test
  (testing "Candidate bindings with multiple fields and bindings"
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          froobs        {:base_type :type/Float
                         :name      "A double number field"}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles
                                         froobs]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (vals (#'interesting/candidate-bindings context dimensions))]
      (testing "3 results are returned - one for each matched field group"
        (is (= 3 (count bindings))))
      (testing "The return data shape is a vector for each field, each of which is a vector of
                each matching dimension, each of which as associated a `:matches` into the
                value of the dimension map."
        (is (=? (for [field [nurnies greebles froobs]]
                  (if (= field froobs)
                    [(update-vals number-dim #(assoc % :matches [field]))]
                    (for [dimension [integer-dim number-dim quantity-dim]]
                      (update-vals dimension #(assoc % :matches [field])))))
                bindings))))))

(deftest ^:parallel bind-dimensions-merge-logic-test
  (testing "An example based test of the merge logic in bind dimensions."
    (let [equal-bindings           [{"Quantity" {:score   100
                                                 :matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   100
                                                 :matches [{:name "Number of Greebles"}]}}]
          a-lt-b-bindings          [{"Quantity" {:matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   100
                                                 :matches [{:name "Number of Greebles"}]}}]
          b-lt-a-bindings          [{"Quantity" {:score   100
                                                 :matches [{:name "Number of Nurnies"}]}}
                                    {"Quantity" {:score   1,
                                                 :matches [{:name "Number of Greebles"}]}}]
          bind-dimensions-merge-fn #(apply merge-with (fn [a b]
                                                        (case (compare (:score a) (:score b))
                                                          1 a
                                                          0 (update a :matches concat (:matches b))
                                                          -1 b))
                                           {}
                                           %)]
      (is (= {"Quantity" {:score 100 :matches [{:name "Number of Nurnies"} {:name "Number of Greebles"}]}}
             (bind-dimensions-merge-fn equal-bindings)))
      (is (= {"Quantity" {:score 100, :matches [{:name "Number of Greebles"}]}}
             (bind-dimensions-merge-fn a-lt-b-bindings)))
      (is (= {"Quantity" {:score 100, :matches [{:name "Number of Nurnies"}]}}
             (bind-dimensions-merge-fn b-lt-a-bindings))))))

(deftest ^:parallel bind-dimensions-3f-4d-test
  (testing "Perform end-to-end dimension binding with multiple dimensions and fields."
    (let [nurnies       {:base_type     :type/Integer
                         :name          "Number of Nurnies"
                         :semantic_type :type/Quantity}
          greebles      {:base_type     :type/Integer
                         :name          "Number of Greebles"
                         :semantic_type :type/Quantity}
          froobs        {:base_type :type/Float
                         :name      "A double number field"}
          context       {:tables
                         [{:entity_type :entity/GenericTable
                           :fields      [nurnies
                                         greebles
                                         froobs]}]}
          integer-dim   {"GenericInteger" {:field_type [:entity/GenericTable :type/Integer], :score 60}}
          number-dim    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
          quantity-dim  {"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
          unmatched-dim {"Range Free Quantity" {:field_type [:type/Quantity], :score 100}}
          dimensions    [integer-dim
                         number-dim
                         quantity-dim
                         unmatched-dim]
          bindings      (#'interesting/find-dimensions context dimensions)]
      (is (= {"Quantity" {:field_type [:entity/GenericTable :type/Quantity],
                          :score 100,
                          :matches    [{:base_type     :type/Integer,
                                        :name          "Number of Nurnies",
                                        :semantic_type :type/Quantity,
                                        :link          nil,
                                        :field_type    [:entity/GenericTable :type/Quantity],
                                        :score         100}
                                       {:base_type     :type/Integer,
                                        :name          "Number of Greebles",
                                        :semantic_type :type/Quantity,
                                        :link          nil,
                                        :field_type    [:entity/GenericTable :type/Quantity],
                                        :score         100}]},
              "GenericNumber" {:field_type [:entity/GenericTable :type/Number],
                               :score      80,
                               :matches    [{:base_type  :type/Float,
                                             :name       "A double number field",
                                             :link       nil,
                                             :field_type [:entity/GenericTable :type/Number],
                                             :score      80}]}}
             bindings)))))

(deftest ^:parallel bind-dimensions-select-most-specific-test
  (testing "When multiple dimensions are candidates the most specific dimension is selected."
    (is (= {"Quantity" {:field_type [:entity/GenericTable :type/Quantity],
                        :score      100,
                        :matches    [{:semantic_type  :type/Quantity,
                                      :name           "QUANTITY",
                                      :effective_type :type/Integer,
                                      :display_name   "Quantity",
                                      :base_type      :type/Integer,
                                      :link           nil,
                                      :field_type     [:entity/GenericTable :type/Quantity],
                                      :score          100}]}}
           (let [context        {:source {:entity_type :entity/GenericTable
                                          :fields      [{:semantic_type  :type/Discount,
                                                         :name           "DISCOUNT"
                                                         :effective_type :type/Float
                                                         :base_type      :type/Float}
                                                        {:semantic_type  :type/Quantity,
                                                         :name           "QUANTITY"
                                                         :effective_type :type/Integer
                                                         :base_type      :type/Integer}]}
                                 :tables [{:entity_type :entity/TransactionTable
                                           :fields      [{:semantic_type  :type/Discount,
                                                          :name           "DISCOUNT"
                                                          :effective_type :type/Float,
                                                          :display_name   "Discount"
                                                          :base_type      :type/Float}
                                                         {:semantic_type  :type/Quantity,
                                                          :name           "QUANTITY"
                                                          :effective_type :type/Integer
                                                          :display_name   "Quantity"
                                                          :base_type      :type/Integer}]}]}
                 dimension-defs [{"Quantity" {:field_type [:entity/GenericTable :type/Quantity], :score 100}}
                                 {"Quantity" {:field_type [:type/Quantity], :score 100}}]]
             (#'interesting/find-dimensions context dimension-defs))))))

(deftest ^:parallel bind-dimensions-single-field-binding-subtleties-test
  (testing "Fields are always bound to one and only one dimension."
    (let [context        {:tables [{:entity_type :entity/GenericTable
                                    :fields      [{:name "DISCOUNT" :base_type :type/Float}
                                                  {:name "QUANTITY" :base_type :type/Float}
                                                  {:name "Date" :base_type :type/Date}]}]}
          dimension-defs [{"Date" {:field_type [:entity/GenericTable :type/Date], :score 100}}
                          {"Profit" {:field_type [:entity/GenericTable :type/Float], :score 100}}
                          {"Revenue" {:field_type [:entity/GenericTable :type/Float], :score 100}}
                          {"Loss" {:field_type [:entity/GenericTable :type/Float], :score 100}}]]
      (testing "All other things being equal, the bound dimension is the last one in the list.
              It's also important to note that we will lose 2 of the 3 Float bindings even if we have a situation like:
              - Chart 1: Revenue vs. Date
              - Chart 2: Profit vs. Loss
              In this situation, we only get the last bound dimension. Note that there is still a dimension selection
              element downstream when choosing metrics (the ordinate dimension), but at this point these potential named
              dimensions are lost as everything is bound to only one of the three."
        (is (=? {"Date" {:matches [{:name "Date"}]}
                 "Loss" {:matches [{:name "DISCOUNT"}
                                   {:name "QUANTITY"}]}}
                (#'interesting/find-dimensions context dimension-defs)))
        (is (=? {"Date"   {:matches [{:name "Date"}]}
                 "Profit" {:matches [{:name "DISCOUNT"}
                                     {:name "QUANTITY"}]}}
                (#'interesting/find-dimensions context
                                               (->> dimension-defs cycle (drop 2) (take 4)))))
        (is (=? {"Date"    {:matches [{:name "Date"}]}
                 "Revenue" {:matches [{:name "DISCOUNT"}
                                      {:name "QUANTITY"}]}}
                (#'interesting/find-dimensions context
                                               (->> dimension-defs cycle (drop 3) (take 4)))))))))

(defn- result-metadata-for-query [query]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (qp.metadata/legacy-result-metadata query nil))

(deftest ^:parallel candidate-binding-inner-shape-test
  (testing "Ensure we have examples to understand the shape returned from candidate-bindings"
    (mt/dataset test-data
      (testing "A model with a single field that matches all potential bindings"
        (let [source-query {:database (mt/id)
                            :query    {:source-table (mt/id :people)
                                       :fields       [(mt/id :people :latitude)]}
                            :type     :query}]
          (mt/with-temp
            [Card card {:table_id        (mt/id :products)
                        :dataset_query   source-query
                        :result_metadata (mt/with-test-user
                                           :rasta
                                           (result-metadata-for-query
                                            source-query))
                        :type            :model}]
            (let [{{:keys [entity_type]} :source :as root} (#'magic/->root card)
                  base-context       (#'magic/make-base-context root)
                  dimensions         [{"GenericNumber" {:field_type [:type/Number], :score 70}}
                                      {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                      {"Lat" {:field_type [:type/Latitude], :score 90}}
                                      {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}]
                  candidate-bindings (#'interesting/candidate-bindings base-context dimensions)]
              (testing "For a model, the entity_type is :entity/GenericTable"
                (is (= :entity/GenericTable entity_type)))
              (is (= (count dimensions)
                     (-> (mt/id :people :latitude)
                         candidate-bindings
                         count)))
              (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]}"
                (is (=?
                     {(mt/id :people :latitude)
                      (map
                       (fn [m]
                         (update-vals m (fn [v]
                                          (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                       dimensions)}
                     candidate-bindings)))))))
      (testing "A model with two fields that each have a high degree of matching."
        (let [source-query {:database (mt/id)
                            :query    {:source-table (mt/id :people)
                                       :fields       [(mt/id :people :latitude)
                                                      (mt/id :people :longitude)]}
                            :type     :query}]
          (mt/with-temp
            [Card card {:table_id        (mt/id :products)
                        :dataset_query   source-query
                        :result_metadata (mt/with-test-user
                                           :rasta
                                           (result-metadata-for-query
                                            source-query))
                        :type            :model}]
            (let [{{:keys [entity_type]} :source :as root} (#'magic/->root card)
                  base-context       (#'magic/make-base-context root)
                  ;; These typically come from the dashboard templates, but can be mocked (injected dyamically if desired) easily.
                  dimensions         [{"GenericNumber" {:field_type [:type/Number], :score 70}}
                                      {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                      {"Lat" {:field_type [:type/Latitude], :score 90}}
                                      {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 100}}
                                      {"Lon" {:field_type [:type/Longitude], :score 90}}
                                      {"Lon" {:field_type [:entity/GenericTable :type/Longitude], :score 100}}]
                  candidate-bindings (#'interesting/candidate-bindings base-context dimensions)]
              (testing "For a model, the entity_type is :entity/GenericTable"
                (is (= :entity/GenericTable entity_type)))
              (testing "Each of these binds to 4 potential binding definitions"
                (is (= 4 (-> (mt/id :people :latitude) candidate-bindings count)))
                (is (= 4 (-> (mt/id :people :longitude) candidate-bindings count))))
              (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]
                                      ;; These matches match 2. They aren't necessarily the same as match-x above.
                                      2 [(assoc matched-dimension-definition-1 :matches [field 2])
                                         (assoc matched-dimension-definition-2 :matches [field 2])
                                         (assoc matched-dimension-definition-3 :matches [field 2])]}"
                (is (=?
                     {(mt/id :people :latitude)
                      (map
                       (fn [m]
                         (update-vals m (fn [v]
                                          (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                       (remove (fn [dimension] (= "Lon" (ffirst dimension))) dimensions))}
                     candidate-bindings))
                (is (=?
                     {(mt/id :people :longitude)
                      (map
                       (fn [m]
                         (update-vals m (fn [v]
                                          (assoc v :matches [{:id (mt/id :people :longitude)}]))))
                       (remove (fn [dimension] (= "Lat" (ffirst dimension))) dimensions))}
                     candidate-bindings)))))))
      (testing "A table with a more specific entity-type will match to more specific binding definitions."
        (let [table (t2/select-one :model/Table (mt/id :people))]
          (let [{{:keys [entity_type]} :source :as root} (#'magic/->root table)
                base-context       (#'magic/make-base-context root)
                dimensions         [{"Loc" {:field_type [:type/Location], :score 60}}
                                    {"GenericNumber" {:field_type [:type/Number], :score 70}}
                                    {"GenericNumber" {:field_type [:entity/GenericTable :type/Number], :score 80}}
                                    {"GenericNumber" {:field_type [:entity/UserTable :type/Number], :score 85}}
                                    {"Lat" {:field_type [:type/Latitude], :score 90}}
                                    {"Lat" {:field_type [:entity/GenericTable :type/Latitude], :score 95}}
                                    {"Lat" {:field_type [:entity/UserTable :type/Latitude], :score 100}}]
                candidate-bindings (#'interesting/candidate-bindings base-context dimensions)]
            (testing "For a model, the entity_type is :entity/UserTable"
              (is (= :entity/UserTable entity_type)))
            (testing "A table of type :entity/UserTable will match on all 6 of the above dimension definitions."
              (is (= (count dimensions)
                     (-> (mt/id :people :latitude)
                         candidate-bindings
                         count))))
            (testing "The return shape of candidate bindings is a map of bound field id to sequence of dimension
                      definitions, each of which has been associated a matches vector containing a single element --
                      the field whose id is the id of the key in this map entry. E.g. if your field id is 1, the result
                      will look like {1 [(assoc matched-dimension-definition-1 :matches [field 1])
                                         (assoc matched-dimension-definition-2 :matches [field 1])
                                         (assoc matched-dimension-definition-3 :matches [field 1])]}

                      While this looks super weird, it groups a single field to every potential binding in the
                      dimension definition list."
              (is (=?
                   {(mt/id :people :latitude)
                    (map
                     (fn [m]
                       (update-vals m (fn [v]
                                        (assoc v :matches [{:id (mt/id :people :latitude)}]))))
                     dimensions)}
                   (select-keys candidate-bindings [(mt/id :people :latitude)]))))))))))

(deftest ^:parallel grounded-metrics-test
  (mt/dataset test-data
    (let [test-metrics [{:metric ["count"], :score 100, :metric-name "Count"}
                        {:metric ["distinct" ["dimension" "FK"]], :score 100, :metric-name "CountDistinctFKs"}
                        {:metric ["/"
                                  ["dimension" "Discount"]
                                  ["dimension" "Income"]], :score 100, :metric-name "AvgDiscount"}
                        {:metric ["sum" ["dimension" "GenericNumber"]], :score 100, :metric-name "Sum"}
                        {:metric ["avg" ["dimension" "GenericNumber"]], :score 100, :metric-name "Avg"}]
          total-field {:id 1 :name "TOTAL"}
          discount-field {:id 2 :name "DISCOUNT"}
          income-field {:id 3 :name "INCOME"}]
      (testing "When no dimensions are provided, we produce grounded dimensionless metrics"
        (is (= [{:metric-name       "Count"
                 :metric-title      "Count"
                 :metric-score      100
                 :metric-definition {:aggregation [["count"]]}
                 :dimension-name->field {}}]
               (interesting/grounded-metrics
                 test-metrics
                 {"Count" {:matches []}}))))
      (testing "When we can match on a dimension, we produce every matching metric (2 for GenericNumber)"
        (is (=? [{:metric-name       "Sum",
                  :metric-definition {:aggregation [["sum" "TOTAL"]]}}
                 {:metric-name       "Avg",
                  :metric-definition {:aggregation [["avg" "TOTAL"]]}}]
                (interesting/grounded-metrics
                  ;; Drop Count
                  (rest test-metrics)
                  {"Count"         {:matches []}
                   "GenericNumber" {:matches [total-field]}}))))
      (testing "The addition of Discount doesn't add more matches as we need
                 Income as well to add the metric that uses Discount"
        (is (=? [{:metric-name       "Sum"
                  :metric-definition {:aggregation [["sum" "TOTAL"]]}}
                 {:metric-name       "Avg"
                  :metric-definition {:aggregation [["avg" "TOTAL"]]}}]
                (interesting/grounded-metrics
                  (rest test-metrics)
                  {"Count"         {:matches []}
                   "GenericNumber" {:matches [total-field]}
                   "Discount"      {:matches [discount-field]}}))))
      (testing "Discount and Income will add the satisfied AvgDiscount grounded metric"
        (is (=? [{:metric-name       "AvgDiscount",
                  :metric-definition {:aggregation [["/" "DISCOUNT" "INCOME"]]}}
                 {:metric-name "Sum"}
                 {:metric-name "Avg"}]
                (interesting/grounded-metrics
                  (rest test-metrics)
                  {"Count"         {:matches []}
                   "GenericNumber" {:matches [total-field]}
                   "Discount"      {:matches [discount-field]}
                   "Income"        {:matches [income-field]}})))))))

(deftest ^:parallel normalize-seq-of-maps-test
  (testing "Convert a seq of size-1 nested maps to a seq of maps."
    (let [{:keys [froobs nurnies]} {:froobs  [{"Foo" {}} {"Bar" {}} {"Fern" {}} {"Doc" {}}]
                                    :nurnies [{"Baz" {:size 100}}]}]
      (is (= [{:froobs-name "Foo"} {:froobs-name "Bar"} {:froobs-name "Fern"} {:froobs-name "Doc"}]
             (interesting/normalize-seq-of-maps :froobs froobs)))
      (is (= [{:nurnies-name "Baz" :size 100}]
             (interesting/normalize-seq-of-maps :nurnies nurnies))))))


;;; ------------------- Datetime resolution inference -------------------

(deftest ^:parallel optimal-temporal-resolution-test
  (doseq [[m base-type expected] [[{:earliest "2015"
                                    :latest   "2017"}
                                   :type/DateTime
                                   :month]
                                  [{:earliest "2017-01-01"
                                    :latest   "2017-03-04"}
                                   :type/DateTime
                                   :day]
                                  [{:earliest "2005"
                                    :latest   "2017"}
                                   :type/DateTime
                                   :year]
                                  [{:earliest "2017-01-01"
                                    :latest   "2017-01-02"}
                                   :type/DateTime
                                   :hour]
                                  [{:earliest "2017-01-01T00:00:00"
                                    :latest   "2017-01-01T00:02:00"}
                                   :type/DateTime
                                   :minute]
                                  [{:earliest "2017-01-01T00:02:00"
                                    :latest   "2017-01-01T00:02:00"}
                                   :type/DateTime
                                   :minute]
                                  [{:earliest "2017-01-01"
                                    :latest   "2017-01-01"}
                                   :type/Date
                                   :day]
                                  [{:earliest "2017-01-01"
                                    :latest   "2018-01-01"}
                                   :type/Date
                                   :month]
                                  [{:earliest "00:02:00"
                                    :latest   "00:02:00"}
                                   :type/Time
                                   :minute]
                                  [{:earliest "00:02:00"
                                    :latest   "10:02:00"}
                                   :type/Time
                                   :hour]]
          :let         [fingerprint {:type {:type/DateTime m}}]]
    (testing (format "base_type=%s, fingerprint = %s" base-type (pr-str fingerprint))
      (is (= expected
             (#'interesting/optimal-temporal-resolution {:fingerprint fingerprint
                                                         :base_type   base-type}))))))
