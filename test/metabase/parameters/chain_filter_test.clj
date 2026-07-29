(ns metabase.parameters.chain-filter-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn shorthand->constraint [field-id v]
  (if-not (vector? v)
    {:field-id field-id
     :op       := :value    v}
    (let [op      (when (keyword? (first v)) (first v))
          options (when (map? (last v)) (last v))
          v       (cond-> v
                    op      (rest)
                    options (butlast))]
      {:field-id field-id
       :op       (or op :=)
       :value    (vec v)
       :options  options})))

(defmacro ^:private chain-filter [field field->value & options]
  `(chain-filter/chain-filter
    (mt/$ids nil ~(symbol (str \% (name field))))
    (mt/$ids nil ~(vec (for [[k v] field->value]
                         (shorthand->constraint (symbol (str \% k)) v))))
    ~@options))

(defmacro ^:private chain-filter-search [field field->value query & options]
  `(chain-filter/chain-filter-search
    (mt/$ids nil ~(symbol (str \% (name field))))
    (mt/$ids nil ~(vec (for [[k v] field->value]
                         (shorthand->constraint (symbol (str \% k)) v))))
    ~query
    ~@options))

(defn take-n-values
  "Call `take` on the result of chain-filter function.

  (take-n-values 1 {:values          [[1] [2] [3]]
                    :has_more_values false})
  -> {:values          [1]
      :has_more_values false}"
  [n result]
  (update result :values #(take n %)))

(deftest ^:parallel special-form-filter-clause-test
  (testing "Can handle multi-arg string filters when chaining (#57287)"
    (let [mp (mt/metadata-provider)]
      (doseq [value ["Omer" ["Omer"] ["Omer" "Clovis"]]]
        (testing (str "with value " (pr-str value))
          (are [op] (some? (#'chain-filter/add-filter
                            (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                            (mt/id :venues)
                            {(mt/id :venues :name) (lib.metadata/field mp (mt/id :venues :name))}
                            {:field-id (mt/id :venues :name)
                             :op op
                             :value value
                             :options nil}))
            :starts-with :ends-with :contains :does-not-contain))))))

(deftest ^:parallel chain-filter-test
  (testing "Show me expensive restaurants"
    (is (= {:values
            [["Dal Rae Restaurant"]
             ["Lawry's The Prime Rib"]
             ["Pacific Dining Car - Santa Monica"]
             ["Sushi Nakazawa"]
             ["Sushi Yasuda"]
             ["Tanoshi Sushi & Sake Bar"]],
            :has_more_values false}
           (chain-filter venues.name {venues.price 4})))))

(deftest ^:parallel chain-filter-test-2
  (testing "Show me categories that have expensive restaurants"
    (is (= {:values [["Japanese"] ["Steakhouse"]], :has_more_values false} (chain-filter categories.name {venues.price 4})))))

(deftest ^:parallel chain-filter-test-2b
  (testing "Show me categories that have expensive restaurants"
    (testing "Should work with string versions of param values"
      (is (= {:values [["Japanese"] ["Steakhouse"]], :has_more_values false}
             (chain-filter categories.name {venues.price "4"}))))))

(deftest ^:parallel chain-filter-test-3
  (testing "Show me categories starting with s (case-insensitive) that have expensive restaurants"
    (is (= {:values [["Steakhouse"]], :has_more_values false}
           (chain-filter categories.name {venues.price 4, categories.name [:starts-with "s" {:case-sensitive false}]})))))

(deftest ^:parallel chain-filter-test-4
  (testing "Show me cheap Thai restaurants"
    (is (= {:values [["Kinaree Thai Bistro"] ["Krua Siri"]], :has_more_values false}
           (chain-filter venues.name {venues.price 1, categories.name "Thai"})))))

(deftest ^:parallel chain-filter-test-5
  (testing "Show me the categories that have cheap restaurants"
    (is (= {:values
            [["Asian"]
             ["BBQ"]
             ["Bakery"]
             ["Bar"]
             ["Burger"]
             ["Caribbean"]
             ["Deli"]
             ["Karaoke"]
             ["Mexican"]
             ["Pizza"]
             ["Southern"]
             ["Thai"]],
            :has_more_values false}
           (chain-filter categories.name {venues.price 1})))))

(deftest ^:parallel chain-filter-test-6
  (testing "Show me cheap restaurants with the word 'taco' in their name (case-insensitive)"
    (is (= {:values [["Tacos Villa Corona"] ["Tito's Tacos"]], :has_more_values false}
           (chain-filter venues.name {venues.price 1, venues.name [:contains "tAcO" {:case-sensitive false}]})))))

(deftest ^:parallel chain-filter-test-7
  (testing "Show me the first 3 expensive restaurants"
    (is (= {:values [["Dal Rae Restaurant"] ["Lawry's The Prime Rib"] ["Pacific Dining Car - Santa Monica"]],
            :has_more_values true}
           (chain-filter venues.name {venues.price 4} :limit 3)))))

(deftest ^:parallel chain-filter-test-8
  (testing "Oh yeah, we actually support arbitrary MBQL filter clauses. Neat!"
    (is (= {:values [["Festa"] ["Fred 62"]], :has_more_values false}
           (chain-filter venues.name {venues.price [:between 2 3], venues.name [:starts-with "f" {:case-sensitive false}]})))))

(deftest ^:parallel multiple-values-test
  (testing "Chain filtering should support multiple values for a single parameter (as a vector or set of values)"
    (testing "Show me restaurants with price = 1 or 2 with the word 'BBQ' in their name (case-sensitive)"
      (is (= {:values          [["Baby Blues BBQ"] ["Beachwood BBQ & Brewing"] ["Bludso's BBQ"]]
              :has_more_values false}
             (chain-filter venues.name {venues.price #{1 2}, venues.name [:contains "BBQ"]}))))))

(deftest ^:parallel multiple-values-test-2
  (testing "Chain filtering should support multiple values for a single parameter (as a vector or set of values)"
    (testing "Show me the possible values of price for Bakery *or* BBQ restaurants"
      (is (= {:values          [[1] [2] [3]]
              :has_more_values false}
             (chain-filter venues.price {categories.name ["Bakery" "BBQ"]}))))))

(deftest ^:parallel auto-parse-string-params-test
  (testing "Parameters that come in as strings (i.e., all of them that come in via the API) should work as intended"
    (is (= {:values          [["Baby Blues BBQ"] ["Beachwood BBQ & Brewing"] ["Bludso's BBQ"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price ["1" "2"], venues.name [:contains "BBQ"]})))))

(deftest ^:parallel unrelated-params-test
  (testing "Parameters that are completely unrelated (don't apply to this Table) should just get ignored entirely"
    ;; there is no way to join from venues -> users so users.id should get ignored
    (binding [chain-filter/*enable-reverse-joins* false]
      (is (= {:values          [[1] [2] [3]]
              :has_more_values false}
             (chain-filter venues.price {categories.name ["Bakery" "BBQ"]
                                         users.id        [1 2 3]}))))))

(def ^:private megagraph
  "A large graph that is hugely interconnected. All nodes can get to 50 and 50 has an edge to :end. But the fastest
  route is [[:start 50] [50 :end]] and we should quickly identify this last route. Basically handy to demonstrate that
  we are doing breadth first search rather than depth first search. Depth first would identify 1 -> 2 -> 3 ... 49 ->
  50 -> end"
  (let [big 50]
    (merge-with merge
                (reduce (fn [m [x y]] (assoc-in m [x y] [[x y]]))
                        {}
                        (for [x     (range (inc big))
                              y     (range (inc big))
                              :when (not= x y)]
                          [x y]))
                {:start (reduce (fn [m x] (assoc m x [[:start x]]))
                                {}
                                (range (inc big)))}
                {big    {:end [[big :end]]}})))

(def ^:private megagraph-single-path
  "Similar to the megagraph above, this graph only has a single path through a hugely interconnected graph. A naive
  graph traversal will run out of memory or take quite a long time to find the traversal:

  [[:start 90] [90 200] [200 :end]]

  There is only one path to end (from 200) and only one path to 200 from 90. If you take out the seen nodes this path
  will not be found as the traversal advances through all of the 50 paths from start, all of the 50 paths from 1, all
  of the 50 paths from 2, ..."
  (merge-with merge
              ;; every node is linked to every other node (1 ... 199)
              (reduce (fn [m [x y]] (assoc-in m [x y] [[x y]]))
                      {}
                      (for [x     (range 200)
                            y     (range 200)
                            :when (not= x y)]
                        [x y]))
              {:start (reduce (fn [m x] (assoc m x [[:start x]]))
                              {}
                              (range 200))}
              ;; only 90 reaches 200 and only 200 (big) reaches the end
              {90  {200 [[90 200]]}
               200 {:end [[200 :end]]}}))

(deftest ^:parallel traverse-graph-test
  (testing "If no need to join, returns immediately"
    (is (nil? (#'chain-filter/traverse-graph {} :start :start 5)))))

(deftest ^:parallel traverse-graph-test-2
  (testing "Finds a simple hop"
    (let [graph {:start {:end [:start->end]}}]
      (is (= [:start->end]
             (#'chain-filter/traverse-graph graph :start :end 5))))))

(deftest ^:parallel traverse-graph-test-3
  (testing "Finds over a few hops"
    (let [graph {:start {:a [:start->a]}, :a {:b [:a->b]}, :b {:c [:b->c]}, :c {:end [:c->end]}}]
      (is (= [:start->a :a->b :b->c :c->end]
             (#'chain-filter/traverse-graph graph :start :end 5)))
      (testing "But will not exceed the max depth"
        (is (nil? (#'chain-filter/traverse-graph graph :start :end 2)))))))

(deftest ^:parallel traverse-graph-test-4
  (testing "Can find a path in a dense and large graph"
    (is (= [[:start 50] [50 :end]]
           (#'chain-filter/traverse-graph megagraph :start :end 5)))
    (is (= [[:start 90] [90 200] [200 :end]]
           (#'chain-filter/traverse-graph megagraph-single-path :start :end 5)))))

(deftest ^:parallel traverse-graph-test-5
  (testing "Returns nil if there is no path"
    (let [graph {:start {1 [[:start 1]]}, 1 {2 [[1 2]]}, 3 {4 [[3 4]]}, 4 {:end [[4 :end]]}}]
      (is (nil? (#'chain-filter/traverse-graph graph :start :end 5))))))

(deftest ^:parallel traverse-graph-test-6
  (testing "Not fooled by loops"
    (let [graph
          {:start {:a [:start->a]},
           :a {:b [:a->b], :a [:b->a]},
           :b {:c [:b->c], :a [:c->a], :b [:c->b]},
           :c {:end [:c->end]}}]
      (is (= [:start->a :a->b :b->c :c->end] (#'chain-filter/traverse-graph graph :start :end 5)))
      (testing "But will not exceed the max depth"
        (is (nil? (#'chain-filter/traverse-graph graph :start :end 2)))))))

(deftest ^:parallel find-joins-test
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport -> municipality"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                 :rhs {:table $$municipality, :field %municipality.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$municipality)))))))

(deftest ^:parallel find-joins-test-2
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport [-> municipality -> region] -> country"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                 :rhs {:table $$municipality, :field %municipality.id}}
                {:lhs {:table $$municipality, :field %municipality.region_id}
                 :rhs {:table $$region, :field %region.id}}
                {:lhs {:table $$region, :field %region.country_id}
                 :rhs {:table $$country, :field %country.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$country)))))))

(deftest ^:parallel find-joins-test-3
  (mt/dataset airports
    (mt/$ids nil
      (testing "[backwards]"
        (testing "municipality -> airport"
          (is (= [{:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality_id}}]
                 (#'chain-filter/find-joins (mt/id) $$municipality $$airport))))))))

(deftest ^:parallel find-joins-test-4
  (mt/dataset airports
    (mt/$ids nil
      (testing "[backwards]"
        (testing "country [-> region -> municipality] -> airport"
          (is (= [{:lhs {:table $$country, :field %country.id}
                   :rhs {:table $$region, :field %region.country_id}}
                  {:lhs {:table $$region, :field %region.id}
                   :rhs {:table $$municipality, :field %municipality.region_id}}
                  {:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality_id}}]
                 (#'chain-filter/find-joins (mt/id) $$country $$airport))))))))

(deftest ^:parallel find-all-joins-test
  (testing "With reverse joins disabled"
    (binding [chain-filter/*enable-reverse-joins* false]
      (mt/$ids nil
        (is (= [{:lhs {:table $$venues, :field %venues.category_id}, :rhs {:table $$categories, :field %categories.id}}]
               (#'chain-filter/find-all-joins (mt/metadata-provider) (mt/id) $$venues #{%categories.name %users.id})))))))

(deftest ^:parallel find-all-joins-test-2
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport [-> municipality] -> region"
        (testing "even though we're joining against the same Table multiple times, duplicate joins should be removed"
          (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                   :rhs {:table $$municipality, :field %municipality.id}}
                  {:lhs {:table $$municipality, :field %municipality.region_id}
                   :rhs {:table $$region, :field %region.id}}]
                 (#'chain-filter/find-all-joins (mt/metadata-provider) (mt/id) $$airport #{%region.name %municipality.name %region.id}))))))))

(deftest ^:parallel multi-hop-test
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "single direct join: Airport -> Municipality"
        (is (= {:values          [["San Francisco International Airport"]]
                :has_more_values false}
               (chain-filter airport.name {municipality.name ["San Francisco"]})))))))

(deftest ^:parallel multi-hop-test-2
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "2 joins required: Airport -> Municipality -> Region"
        (is (= {:values          [["Beale Air Force Base"]
                                  ["Edwards Air Force Base"]
                                  ["John Wayne Airport-Orange County Airport"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {region.name ["California"]}))))))))

(deftest ^:parallel multi-hop-test-3
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "3 joins required: Airport -> Municipality -> Region -> Country"
        (is (= {:values          [["Abraham Lincoln Capital Airport"]
                                  ["Albuquerque International Sunport"]
                                  ["Altus Air Force Base"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {country.name ["United States"]}))))))))

(deftest ^:parallel multi-hop-test-4
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "4 joins required: Airport -> Municipality -> Region -> Country -> Continent"
        (is (= {:values          [["Afonso Pena Airport"]
                                  ["Alejandro Velasco Astete International Airport"]
                                  ["Carrasco International /General C L Berisso Airport"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {continent.name ["South America"]}))))))))

(deftest ^:parallel multi-hop-test-5a
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "[backwards]"
        (testing "single direct join: Municipality -> Airport"
          (is (= {:values          [["San Francisco"]]
                  :has_more_values false}
                 (chain-filter municipality.name {airport.name ["San Francisco International Airport"]}))))))))

(deftest ^:parallel multi-hop-test-5b
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "[backwards]"
        (testing "2 joins required: Region -> Municipality -> Airport"
          (is (= {:values          [["California"]]
                  :has_more_values false}
                 (chain-filter region.name {airport.name ["San Francisco International Airport"]}))))))))

(deftest ^:parallel multi-hop-test-5c
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "[backwards]"
        (testing "3 joins required: Country -> Region -> Municipality -> Airport"
          (is (= {:values          [["United States"]]
                  :has_more_values false}
                 (chain-filter country.name {airport.name ["San Francisco International Airport"]}))))))))

(deftest ^:parallel multi-hop-test-5d
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "[backwards]"
        (testing "4 joins required: Continent -> Region -> Municipality -> Airport"
          (is (= {:values          [["North America"]]
                  :has_more_values false}
                 (chain-filter continent.name {airport.name ["San Francisco International Airport"]}))))))))

(deftest ^:parallel filterable-field-ids-test
  (mt/$ids
    (testing (format "venues.price = %d categories.name = %d users.id = %d\n" %venues.price %categories.name %users.id)
      (is (= #{%categories.name %users.id}
             (chain-filter/filterable-field-ids %venues.price #{%categories.name %users.id}))))))

(deftest ^:parallel filterable-field-ids-test-2
  (mt/$ids
    (testing (format "venues.price = %d categories.name = %d users.id = %d\n" %venues.price %categories.name %users.id)
      (testing "reverse joins disabled: should exclude users.id"
        (binding [chain-filter/*enable-reverse-joins* false]
          (is (= #{%categories.name}
                 (chain-filter/filterable-field-ids %venues.price #{%categories.name %users.id}))))))))

(deftest ^:parallel filterable-field-ids-test-3
  (mt/$ids
    (testing (format "venues.price = %d categories.name = %d users.id = %d\n" %venues.price %categories.name %users.id)
      (testing "return nil if filtering-field-ids is empty"
        (is (= nil
               (chain-filter/filterable-field-ids %venues.price #{})))))))

(deftest ^:parallel chain-filter-search-test
  (testing "Show me categories containing 'eak' (case-insensitive) that have expensive restaurants"
    (is (= {:values          [["Steakhouse"]]
            :has_more_values false}
           (chain-filter-search categories.name {venues.price 4} "eak")))))

(deftest ^:parallel chain-filter-search-test-2
  (testing "Show me cheap restaurants including with 'taco' (case-insensitive)"
    (is (= {:values          [["Tacos Villa Corona"] ["Tito's Tacos"]]
            :has_more_values false}
           (chain-filter-search venues.name {venues.price 1} "tAcO")))))

(deftest ^:parallel chain-filter-search-test-3
  (testing "search for something crazy = should return empty results"
    (is (= {:values          []
            :has_more_values false}
           (chain-filter-search categories.name {venues.price 4} "zzzzz")))))

(deftest ^:parallel chain-filter-search-test-4
  (testing "Field that doesn't exist should throw a 404"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Field [\d,]+ does not exist"
         (chain-filter/chain-filter-search Integer/MAX_VALUE nil "s")))))

(deftest ^:parallel chain-filter-search-test-5
  (testing "Field that isn't type/Text should throw a 400"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cannot search against non-Text Field"
         (chain-filter/chain-filter-search (mt/$ids %venues.price) nil "s")))))

;;; --------------------------------------------------- Remapping ----------------------------------------------------

(defn do-with-human-readable-values-remapping! [thunk]
  (mt/with-column-remappings [venues.category_id (values-of categories.name)]
    (thunk)))

(defmacro with-human-readable-values-remapping! {:style/indent 0} [& body]
  `(do-with-human-readable-values-remapping! (fn [] ~@body)))

(deftest human-readable-values-remapped-chain-filter-test
  (with-human-readable-values-remapping!
    (testing "Show me category IDs for categories"
      ;; there are no restaurants with category 1
      (is (= {:values          [[2 "American"]
                                [3 "Artisan"]
                                [4 "Asian"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.category_id nil)))))
    (testing "Show me category IDs for categories that have expensive restaurants"
      (is (= {:values          [[40 "Japanese"]
                                [67 "Steakhouse"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.category_id {venues.price 4})))))
    (testing "Show me the category 40 (constraints do not support remapping)"
      (is (= {:values          [[40 "Japanese"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.category_id {venues.category_id 40})))))))

(deftest human-readable-values-remapped-chain-filter-search-test
  (with-human-readable-values-remapping!
    (testing "Show me category IDs [whose name] contains 'bar'"
      (testing "\nconstraints = {}"
        (is (= {:values          [[7 "Bar"]
                                  [74 "Wine Bar"]]
                :has_more_values false}
               (chain-filter-search venues.category_id {} "bar")))))
    (testing "\nconstraints = nil"
      (is (= {:values          [[7 "Bar"]
                                [74 "Wine Bar"]]
              :has_more_values false}
             (chain-filter-search venues.category_id nil "bar"))))
    (testing "Show me category IDs [whose name] contains 'house' that have expensive restaurants"
      (is (= {:values          [[67 "Steakhouse"]]
              :has_more_values false}
             (chain-filter-search venues.category_id {venues.price 4} "house"))))
    (testing "search for something crazy: should return empty results"
      (is (= {:values          []
              :has_more_values false}
             (chain-filter-search venues.category_id {venues.price 4} "zzzzz"))))))

(deftest ^:parallel field-to-field-remapped-field-id-test
  (is (= (mt/id :venues :name)
         (#'chain-filter/remapped-field-id (mt/id :venues :id)))))

(deftest ^:parallel fk-field-to-pk-field-to-name-field-remapped-field-id-test
  (is (= (mt/id :people :name)
         (#'chain-filter/remapped-field-id (mt/id :orders :user_id)))))

(deftest ^:parallel field-to-field-remapped-chain-filter-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs (names)"
      (is (= {:values [[29 "20th Century Cafe"]
                       [8 "25°"]
                       [93 "33 Taps"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.id nil)))))))

(deftest ^:parallel field-to-field-remapped-chain-filter-test-2
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me expensive venue IDs (names)"
      (is (= {:values          [[55 "Dal Rae Restaurant"]
                                [61 "Lawry's The Prime Rib"]
                                [16 "Pacific Dining Car - Santa Monica"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.id {venues.price 4})))))))

(deftest ^:parallel field-to-field-remapped-chain-filter-search-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs that [have a remapped name that] contains 'sushi'"
      (is (= {:values          [[76 "Beyond Sushi"]
                                [80 "Blue Ribbon Sushi"]
                                [77 "Sushi Nakazawa"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter-search venues.id nil "sushi")))))))

(deftest ^:parallel field-to-field-remapped-chain-filter-search-test-2
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs that [have a remapped name that] contain 'sushi' that are expensive"
      (is (= {:values          [[77 "Sushi Nakazawa"]
                                [79 "Sushi Yasuda"]
                                [81 "Tanoshi Sushi & Sake Bar"]]
              :has_more_values false}
             (chain-filter-search venues.id {venues.price 4} "sushi"))))))

(deftest ^:parallel field-to-field-remapped-chain-filter-search-test-3
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "search for something crazy = should return empty results"
      (is (= {:values          []
              :has_more_values false}
             (chain-filter-search venues.id {venues.price 4} "zzzzz"))))))

(defmacro with-fk-field-to-field-remapping! {:style/indent 0} [& body]
  `(mt/with-column-remappings [~'venues.category_id ~'categories.name]
     ~@body))

(deftest fk-field-to-field-remapped-field-id-test
  (with-fk-field-to-field-remapping!
    (is (= (mt/id :categories :name)
           (#'chain-filter/remapped-field-id (mt/id :venues :category_id))))))

(deftest fk-field-to-field-remapped-chain-filter-test
  (with-fk-field-to-field-remapping!
    (testing "Show me category IDs for categories"
      ;; there are no restaurants with category 1
      (is (= {:values          [[2 "American"]
                                [3 "Artisan"]
                                [4 "Asian"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.category_id nil)))))
    (testing "Show me category IDs for categories that have expensive restaurants"
      (is (= {:values          [[40 "Japanese"]
                                [67 "Steakhouse"]]
              :has_more_values false}
             (chain-filter venues.category_id {venues.price 4}))))
    (testing "Show me the category 40 (constraints do not support remapping)"
      (is (= {:values          [[40 "Japanese"]]
              :has_more_values false}
             (chain-filter venues.category_id {venues.category_id 40}))))))

(deftest fk-field-to-field-remapped-chain-filter-search-test
  (with-fk-field-to-field-remapping!
    (testing "Show me categories containing 'ar'"
      (testing "\nconstraints = {}"
        (is (= {:values          [[3 "Artisan"]
                                  [7 "Bar"]
                                  [14 "Caribbean"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter-search venues.category_id {} "ar")))))
      (testing "\nconstraints = nil"
        (is (= {:values         [[3 "Artisan"]
                                 [7 "Bar"]
                                 [14 "Caribbean"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter-search venues.category_id nil "ar"))))))
    (testing "Show me categories containing 'house' that have expensive restaurants"
      (is (= {:values          [[67 "Steakhouse"]]
              :has_more_values false}
             (chain-filter-search venues.category_id {venues.price 4} "house"))))
    (testing "search for something crazy = should return empty results"
      (is (= {:values          []
              :has_more_values false}
             (chain-filter-search venues.category_id {venues.price 4} "zzzzz"))))))

;;; ------------ Structural invariant: tight inner-stage :fields per join ------------
;;;
;;; Two failure modes the invariant rules out:
;;;
;;;   - UNDER-projection — a column the query references via this join is missing from the
;;;     inner :fields. SQL won't compile (or projects the wrong shape) and the query returns
;;;     wrong/missing values.
;;;
;;;   - OVER-projection — the inner :fields contains a column nothing references. SQL
;;;     compiles fine and values are correct, but we're materializing columns we don't need,
;;;     which on wide tables could OOM an engine.

(defn- referenced-field-ids-by-join-alias
  "Return `{alias #{field-id ...}}` — for every `[:field {:join-alias A} id]` ref in `query`'s outer stage (including
  refs in each outer-stage join's `:conditions` and outer `:fields`), bucket by `A`. Does NOT recurse into joins'
  inner stages or any nested query — aliases are stage-scoped, so merging refs across scopes would silently
  mis-attribute fields to the wrong join."
  [query]
  (let [acc     (volatile! {})
        collect (fn [clause]
                  (when (lib.util/clause-of-type? clause :field)
                    (let [[_ opts id] clause
                          alias       (:join-alias opts)]
                      (when (and alias (pos-int? id))
                        (vswap! acc update alias (fnil conj #{}) id))))
                  nil)]
    (lib.walk/walk-clauses-in-stage (lib.util/query-stage query -1) collect)
    (doseq [a-join (lib/joins query)
            clause (concat (lib/join-conditions a-join)
                           (let [outer-fields (lib/join-fields a-join)]
                             (when (sequential? outer-fields) outer-fields)))]
      (lib.walk/walk-clause clause collect))
    @acc))

(defn- inner-projection-field-ids
  "Set of field-ids that `a-join`'s inner-stage `:fields` projects. Structural read: the projection list is the thing
  under test."
  [a-join]
  (into #{} (mapcat lib/all-field-ids) (:fields (first (:stages a-join)))))

(defn- inner-projection-by-join-alias
  "Return `{alias #{field-id ...}}` — the field-ids each join's inner-stage `:fields` projects, keyed by the join's
  alias."
  [query]
  (into {}
        (for [a-join (lib/joins query)
              :let [a-alias (lib/current-join-alias a-join)]
              :when a-alias]
          [a-alias (inner-projection-field-ids a-join)])))

(defn- projection-violations
  "Return a seq of diagnostic maps (one per offending join's alias) or nil if the invariant holds: each join's
  inner-stage `:fields` equals exactly the field-ids the rest of the query references through that join's alias."
  [query]
  (let [refs (referenced-field-ids-by-join-alias query)
        proj (inner-projection-by-join-alias query)]
    (not-empty
     (vec
      (for [a-alias (sort (into (set (keys refs)) (keys proj)))
            :let [r (get refs a-alias #{})
                  p (get proj a-alias #{})]
            :when (not= r p)]
        {:alias                   a-alias
         :referenced              r
         :projected               p
         :missing-from-projection (set/difference r p)
         :extra-in-projection     (set/difference p r)})))))

(defn- mbql-for
  "Build the chain-filter MBQL query for a given field/original/constraints triple."
  [field-id original-field-id constraints]
  (#'chain-filter/chain-filter-mbql-query
   field-id
   (when (seq constraints)
     (vec (for [[fid v] constraints]
            (shorthand->constraint fid v))))
   (when original-field-id {:original-field-id original-field-id})))

(defn- sql-over-projections
  "Return a map of `{table-id {:declared #{…} :actual #{…} :extra #{…}}}` for any joined Table whose compiled-SQL
  field references aren't a subset of the MBQL inner-stage `:fields` for that join. Returns nil if the SQL is tight.

  Keyed by table-id (not alias) because `sql-tools/referenced-fields` reports columns by `:table-id`, and the SQL
  emitter aggregates across joins to the same table. When multiple joins target the same table-id, `:declared` is the
  union of their inner-stage projections."
  [query]
  (let [driver    (t2/select-one-fn :engine :model/Database :id (:database query))
        sql       (:query (qp.compile/compile query))
        nq        (lib/native-query query sql)
        sql-refs  (reduce (fn [m {:keys [table-id id]}]
                            (update m table-id (fnil conj #{}) id))
                          {}
                          (sql-tools/referenced-fields driver nq))
        mbql-proj (reduce (fn [m a-join]
                            (let [tid (:id (lib/joined-thing query a-join))]
                              (cond-> m
                                tid (update tid (fnil into #{}) (inner-projection-field-ids a-join)))))
                          {} (lib/joins query))]
    (not-empty
     (into {}
           (for [[tid declared] mbql-proj
                 :let [actual (get sql-refs tid #{})
                       extra  (set/difference actual declared)]
                 :when (seq extra)]
             [tid {:declared declared, :actual actual, :extra extra}])))))

(defn- check-tight-projections
  "Run both the MBQL-level and SQL-level invariants on a chain-filter query."
  [query]
  (testing "MBQL: each join's inner-stage :fields equals the fields referenced on its source table"
    (is (nil? (projection-violations query))))
  (testing "SQL: the compiled query references no joined-Table columns outside MBQL :fields"
    (is (nil? (sql-over-projections query)))))

;;; Scenarios that exercise the join-building paths in `chain-filter-mbql-query`. Each
;;; `:build` thunk runs inside `mt/dataset test-data` so `mt/id` resolves correctly.
(def ^:private projection-scenarios
  [{:label "no-joins"
    :build #(mbql-for (mt/id :categories :name) nil nil)}
   {:label "fk-remap-only (#74154)"
    :build #(mbql-for (mt/id :categories :name) (mt/id :venues :category_id) nil)}
   {:label "fk-remap + same-table constraint"
    :build #(mbql-for (mt/id :categories :name) (mt/id :venues :category_id)
                      {(mt/id :venues :price) 4})}
   {:label "constraint only, reverse-direction join"
    :build #(mbql-for (mt/id :categories :name) nil {(mt/id :venues :price) 4})}
   {:label "constraint on a different joined table"
    :build #(mbql-for (mt/id :venues :name) nil {(mt/id :categories :name) "BBQ"})}
   {:label "multi-hop chain (categories→venues→checkins→users)"
    :build #(mbql-for (mt/id :categories :name) nil
                      {(mt/id :users :name) "Charles Lindbergh"})}
   {:label "multi-hop + multi-table constraints"
    :build #(mbql-for (mt/id :categories :name) nil
                      {(mt/id :venues :price) 4
                       (mt/id :users :name) "Charles Lindbergh"})}])

(deftest ^:parallel tight-projections-test
  (mt/dataset test-data
    (doseq [{:keys [label build]} projection-scenarios]
      (testing label
        (check-tight-projections (build))))))

(deftest ^:parallel tighten-leaves-card-source-joins-untouched-test
  ;; chain-filter never produces card-source joins today; this test guards against silent breakage if a future caller
  ;; uses tighten-join-projections on a query that does. Without the `:metadata/table` check in tighten, the join's
  ;; inner-stage `:fields` would be dissoc'd (because `:id` of a card metadata won't match any field's `:table-id`),
  ;; re-exposing the original add-implicit-clauses expansion bug for that join.
  (mt/dataset test-data
    (mt/with-temp [:model/Card temp-card {:dataset_query {:database (mt/id)
                                                          :type     :query
                                                          :query    {:source-table (mt/id :venues)}}}]
      (let [;; Build a real chain-filter query, then synthesize a card-source join by swapping `:source-table` for
            ;; `:source-card` on the venues join's inner stage. The Card just needs to exist as a metadata-provider
            ;; entry — its actual query doesn't matter for this structural check.
            q             (mbql-for (mt/id :categories :name) (mt/id :venues :category_id) nil)
            q-mocked      (-> q
                              (update-in [:stages 0 :joins 0 :stages 0] dissoc :source-table)
                              (assoc-in  [:stages 0 :joins 0 :stages 0 :source-card] (:id temp-card)))
            inner-before  (first (:stages (first (lib/joins q-mocked))))
            q-tightened   (#'chain-filter/tighten-join-projections q-mocked)
            inner-after   (first (:stages (first (lib/joins q-tightened))))]
        (is (= (:fields inner-before) (:fields inner-after))
            "tighten must not modify :fields on a card-source join's inner stage")))))

(defn- find-partition-filter
  "Return the `[:> [:field {:join-alias join-alias} partition-fid] _]` clause from `query`'s outer-stage `:filters`,
  or nil if none. `:join-alias` on the field ref must equal `join-alias` exactly (pass `nil` to match a source-table
  ref with no `:join-alias`)."
  [query partition-fid join-alias]
  (some (fn [clause]
          (and (vector? clause)
               (= :> (first clause))
               (let [field (nth clause 2 nil)]
                 (and (vector? field)
                      (= :field (first field))
                      (= partition-fid (last field))
                      (= join-alias (:join-alias (second field)))
                      clause))))
        (-> query :stages first :filters)))

(deftest ^:sequential chain-filter-preserves-required-partition-filter-on-joined-table-test
  ;; `add-required-filters-if-needed` runs near the end of `chain-filter-mbql-query`, after joins are built. For
  ;; tables that require a partition filter (currently BigQuery partitioned tables), it adds a `[:> partition-col _]`
  ;; clause; when the partition column lives on a *joined* table, the clause references it through the join's alias.
  ;;
  ;; A fix that narrows the join's projection up front — and doesn't account for filters added later — silently
  ;; elides the partition filter, because the joined-Table column it would reference is no longer in
  ;; `visible-columns`. That's a behavior regression on BigQuery.
  ;;
  ;; The query below is chosen so venues becomes a JOIN target (source = categories, constraint on venues.id), and
  ;; the partition column (venues.price) is not referenced by anything the user wrote. So if tighten-join-projections
  ;; correctly survives the late-added partition filter, venues.price ends up in the venues join's inner stage
  ;; *only because of the partition filter middleware*.
  (mt/dataset test-data
    (let [venues-id     (mt/id :venues)
          partition-fid (mt/id :venues :price)]
      (mt/with-temp-vals-in-db :model/Table venues-id {:database_require_filter true}
        (mt/with-temp-vals-in-db :model/Field partition-fid {:database_partitioned true}
          (let [q            (mbql-for (mt/id :categories :name)
                                       nil
                                       {(mt/id :venues :id) 1})
                venues-alias (some (fn [j]
                                     (when (= venues-id (:id (lib/joined-thing q j)))
                                       (lib/current-join-alias j)))
                                   (lib/joins q))]
            (testing "partition filter clause is present in :filters, referencing the joined-table alias"
              (is (some? (find-partition-filter q partition-fid venues-alias))
                  (str "expected a [:> [:field {:join-alias " (pr-str venues-alias) "} " partition-fid "] _] clause "
                       "in :filters; got: " (pr-str (-> q :stages first :filters)))))
            (testing "venues join projects partition column in its inner stage"
              (is (contains? (get (inner-projection-by-join-alias q) venues-alias) partition-fid)
                  (str "expected " partition-fid " in inner stage of venues join (" (pr-str venues-alias) ")")))))))))

;; Detail: Key (entity_id)=(6nmVTpCpKFRkZJigvqSVm) already exists.
(deftest use-cached-field-values-test
  (testing "chain-filter should use cached FieldValues if applicable (#13832)"
    (let [field-id (mt/id :categories :name)]
      (mt/with-model-cleanup [:model/FieldValues]
        (testing "should created a full FieldValues when constraints is `nil`"
          ;; warm up the cache
          (chain-filter categories.name nil)
          (mt/with-dynamic-fn-redefs [params.field-values/prepare-advanced-field-values (fn [& _args]
                                                                                          (assert false "Should not be called"))]
            (is (= {:values          [["African"] ["American"] ["Artisan"]]
                    :has_more_values false}
                   (take-n-values 3 (chain-filter categories.name nil))))
            (is (= 1 (t2/count :model/FieldValues :field_id field-id :type :full)))))
        (testing "should create a linked-filter FieldValues when have constraints"
          ;; make sure we have a clean start
          (field-values/clear-advanced-field-values-for-field! field-id)
          ;; warm up the cache
          (chain-filter categories.name {venues.price 4})
          (mt/with-dynamic-fn-redefs [params.field-values/prepare-advanced-field-values (fn [& _args]
                                                                                          (assert false "Should not be called"))]
            (is (= {:values          [["Japanese"] ["Steakhouse"]]
                    :has_more_values false}
                   (chain-filter categories.name {venues.price 4})))
            (is (= 1 (t2/count :model/FieldValues :field_id field-id :type :advanced)))))
        (testing "should search with the cached FieldValues when search without constraints"
          (mt/with-temp
            [:model/Field       field (-> (t2/select-one :model/Field (mt/id :categories :name))
                                          (dissoc :id)
                                          (assoc :name "NAME2"))
             :model/FieldValues  _    {:field_id (:id field)
                                       :type     :full
                                       :values   ["Goooood" "Bad"]}]
            (is (= {:values          [["Goooood"]]
                    :has_more_values false}
                   (chain-filter-search categories.name2 nil "oooood")))))
        (testing "search with constraints"
          ;; make sure we have a clean start
          (field-values/clear-advanced-field-values-for-field! field-id)
          (testing "should create a linked-filter FieldValues"
            ;; warm up the cache
            (chain-filter categories.name {venues.price 4})
            (is (= 1 (t2/count :model/FieldValues :field_id field-id :type :advanced))))
          (testing "should search for the values of linked-filter FieldValues"
            (t2/update! :model/FieldValues {:field_id field-id
                                            :type     :advanced}
                        {:values (json/encode ["Good" "Bad"])
                         ;; HACK: currently this is hardcoded to true for linked-filter
                         ;; in [[params.field-values/fetch-advanced-field-values]]
                         ;; we want this to false to test this case
                         :has_more_values false})
            (is (= {:values          [["Good"]]
                    :has_more_values false}
                   (chain-filter-search categories.name {venues.price 4} "o")))
            (testing "Shouldn't use cached FieldValues if has_more_values=true"
              (t2/update! :model/FieldValues {:field_id field-id
                                              :type     :advanced}
                          {:has_more_values true})
              (is (= {:values          [["Steakhouse"]]
                      :has_more_values false}
                     (chain-filter-search categories.name {venues.price 4} "o"))))))))))

(deftest use-cached-field-values-for-remapped-field-test
  (testing "fetching a remapped field should returns remapped values (#21528)"
    (mt/with-discard-model-updates! [:model/Field]
      (t2/update! :model/Field (mt/id :venues :category_id) {:has_field_values "list"})
      (mt/with-column-remappings [venues.category_id categories.name]
        (is (= {:values          [[2 "American"] [3 "Artisan"] [4 "Asian"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter/chain-filter (mt/id :venues :category_id) nil))))
        (is (= {:values          [[4 "Asian"]]
                :has_more_values false}
               (chain-filter/chain-filter-search (mt/id :venues :category_id) nil "sian")))))))

(deftest ^:parallel time-interval-test
  (testing "chain-filter should accept time interval strings like `past32weeks` for temporal Fields"
    (mt/$ids
      (is (=? {:stages [{:filters [[:time-interval {:include-current false}
                                    [:field {} (mt/id :checkins :date)]
                                    -32
                                    :week]]}]}
              (let [mp (mt/metadata-provider)]
                (#'chain-filter/add-filter
                 (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                 $$checkins
                 {%checkins.date (lib.metadata/field mp %checkins.date)}
                 {:field-id %checkins.date
                  :op       :=
                  :value    "past32weeks"})))))))

(mt/defdataset nil-values-dataset
  [["tbl"
    [{:field-name "mytype", :base-type :type/Text}
     {:field-name "myfield", :base-type :type/Text}]
    [["value" "value"]
     ["null" nil]
     ["empty" ""]]]])

(deftest nil-values-test
  (testing "Chain filter fns should work for fields that have nil or empty values (#17659)"
    (mt/dataset nil-values-dataset
      (mt/$ids tbl
        (letfn [(thunk []
                  (doseq [[field expected-values] {:mytype  {:values          [["empty"] ["null"] ["value"]]
                                                             :has_more_values false}
                                                   :myfield {:values          [[nil] [""] ["value"]]
                                                             :has_more_values false}}]
                    (testing "chain-filter"
                      ;; sorting can differ a bit based on whether we use FieldValues or not... not sure why this is
                      ;; ;; the case, but that's not important for this test anyway. Just sort everything
                      (is (= expected-values
                             (update (chain-filter/chain-filter (mt/id :tbl field) []) :values sort))))
                    (testing "chain-filter-search"
                      (is (= {:values          [["value"]]
                              :has_more_values false}
                             (chain-filter/chain-filter-search (mt/id :tbl field) [] "val"))))))]
          (testing "no FieldValues"
            (thunk))
          (testing "with FieldValues for myfield"
            (mt/with-temp [:model/FieldValues _ {:field_id %myfield, :values ["value" nil ""]}]
              (mt/with-temp-vals-in-db :model/Field %myfield {:has_field_values "auto-list"}
                (testing "Sanity check: make sure we will actually use the cached FieldValues"
                  (is (field-values/field-should-have-field-values? %myfield))
                  (is (#'chain-filter/use-cached-field-values? %myfield)))
                (thunk)))))))))

(defn- do-with-clean-field-values-for-field!
  [field-or-field-id thunk]
  (mt/with-model-cleanup [:model/FieldValues]
    (let [field-id         (u/the-id field-or-field-id)
          has_field_values (t2/select-one-fn :has_field_values :model/Field :id field-id)
          fvs              (t2/select :model/FieldValues :field_id field-id)]
      ;; switch to "list" to prevent [[field-values/create-or-update-full-field-values!]]
      ;; from changing this to `nil` if the field is `auto-list` and exceeds threshholds
      (t2/update! :model/Field field-id {:has_field_values "list"})
      (t2/delete! :model/FieldValues :field_id field-id)
      (try
        (thunk)
        (finally
          (t2/update! :model/Field field-id {:has_field_values has_field_values})
          (t2/insert! :model/FieldValues fvs))))))

(defmacro ^:private with-clean-field-values-for-field!
  "Run `body` with all FieldValues for `field-id` deleted.
  Restores the deleted FieldValues when we're done."
  {:style/indent 1}
  [field-or-field-id & body]
  `(do-with-clean-field-values-for-field! ~field-or-field-id (fn [] ~@body)))

(deftest chain-filter-has-more-values-test
  (testing "the `has_more_values` property should be correct\n"
    (testing "for cached fields"
      (testing "without contraints"
        (with-clean-field-values-for-field! (mt/id :categories :name)
          (testing "`false` for field has values less than [[field-values/*total-max-length*]] threshold"
            (is (= false
                   (:has_more_values (chain-filter categories.name {})))))
          (testing "`true` if the limit option is less than the count of values of fieldvalues"
            (is (true?
                 (:has_more_values (chain-filter categories.name {} :limit 1)))))
          (testing "`false` if the limit option is greater the count of values of fieldvalues"
            (is (= false
                   (:has_more_values (chain-filter categories.name {} :limit Integer/MAX_VALUE))))))
        (testing "`true` if the values of a field exceeds our [[field-values/*total-max-length*]] limit"
          (with-clean-field-values-for-field! (mt/id :categories :name)
            (binding [field-values/*total-max-length* 10]
              (is (true?
                   (:has_more_values (chain-filter categories.name {}))))))))
      (testing "with contraints"
        (with-clean-field-values-for-field! (mt/id :categories :name)
          (testing "`false` for field has values less than [[field-values/*total-max-length*]] threshold"
            (is (= false
                   (:has_more_values (chain-filter categories.name {venues.price 4})))))
          (testing "`true` if the limit option is less than the count of values of fieldvalues"
            (is (true?
                 (:has_more_values (chain-filter categories.name {venues.price 4} :limit 1)))))
          (testing "`false` if the limit option is greater the count of values of fieldvalues"
            (is (= false
                   (:has_more_values (chain-filter categories.name {venues.price 4} :limit Integer/MAX_VALUE))))))
        (with-clean-field-values-for-field! (mt/id :categories :name)
          (testing "`true` if the values of a field exceeds our [[field-values/*total-max-length*]] limit"
            (binding [field-values/*total-max-length* 10]
              (is (true?
                   (:has_more_values (chain-filter categories.name {venues.price 4})))))))))
    (testing "for non-cached fields"
      (testing "with contraints"
        (with-clean-field-values-for-field! (mt/id :venues :latitude)
          (testing "`false` if we don't specify limit"
            (is (= false
                   (:has_more_values (chain-filter venues.latitude {venues.price 4})))))
          (testing "`true` if the limit is less than the number of values the field has"
            (is (true?
                 (:has_more_values (chain-filter venues.latitude {venues.price 4} :limit 1))))))))))

;; TODO: make this test parallel, but clj-kondo complains about t2/update! being destructive and no amount of
;; :clj-kondo/ignore convinces it.
(deftest chain-filter-inactive-test
  (testing "Inactive fields are not used to generate joins"
    ;; custom dataset so that destructive operations (especially marking PK inactive) won't have any effect on other
    ;; tests
    (mt/with-temp-test-data [["users"
                              [{:field-name "name"
                                :base-type :type/Text}]
                              []]
                             ["messages"
                              [{:field-name "receiver_id"
                                :base-type :type/Integer
                                :fk :users}
                               {:field-name "sender_id"
                                :base-type :type/Integer
                                :fk :users}]
                              []]]
      (mt/$ids nil
        (mt/with-dynamic-fn-redefs [chain-filter/database-fk-relationships @#'chain-filter/database-fk-relationships*
                                    chain-filter/find-joins                (fn
                                                                             ([a b c]
                                                                              (#'chain-filter/find-joins* a b c false))
                                                                             ([a b c d]
                                                                              (#'chain-filter/find-joins* a b c d)))]
          (testing "with both FKs active, both are returned"
            (is (= [{:lhs {:table $$messages, :field %messages.receiver_id}
                     :rhs {:table $$users, :field %users.id}}
                    {:lhs {:table $$messages, :field %messages.sender_id}
                     :rhs {:table $$users, :field %users.id}}]
                   (->> (#'chain-filter/find-joins (mt/id) $$messages $$users)
                        (sort-by (comp :field :lhs))))))
          (try
            (t2/update! :model/Field {:id %messages.receiver_id} {:active false})
            (testing "check that it switches to sender only once receiver is inactive"
              (is (= [{:lhs {:table $$messages, :field %messages.sender_id}
                       :rhs {:table $$users, :field %users.id}}]
                     (#'chain-filter/find-joins (mt/id) $$messages $$users))))
            (finally
              (t2/update! :model/Field {:id %messages.receiver_id} {:active true})))
          (try
            (t2/update! :model/Field {:id %messages.sender_id} {:active false})
            (testing "check that it switches to receiver only once sender is inactive"
              (is (= [{:lhs {:table $$messages, :field %messages.receiver_id}
                       :rhs {:table $$users, :field %users.id}}]
                     (#'chain-filter/find-joins (mt/id) $$messages $$users))))
            (finally
              (t2/update! :model/Field {:id %messages.sender_id} {:active true})))
          ;; mark field
          (t2/update! :model/Field {:id %users.id} {:active false})
          (testing "there are no connections when PK is inactive"
            (is (nil? (#'chain-filter/find-joins (mt/id) $$messages $$users)))))))))

;;; --------------------- chain-filter-mbql-query metadata app-DB call counts (no metadata N+1) ---------------------
;;;
;;; `chain-filter-mbql-query` bulk-loads all the Field/Table metadata it needs while building the query (see
;;; `find-all-joins`, `add-joins`, `add-filters`), so the number of app-DB calls is bounded: it does NOT grow with the
;;; number of constraints, nor with the number/depth of joins. A second build reuses the request-scoped
;;; metadata-provider cache and makes no app-DB calls at all. If a metadata fetch regresses to
;;; one-object-at-a-time, these exact counts change.

(defn- chain-filter-mbql-query-call-counts
  "Warm the process-global memoized caches (FK graph, `field-id->database-id`) for `field-id`/`constraints`, then
  return the app-DB call counts of a first build (fresh provider cache) and a second build (warm cache)."
  [field-id constraints]
  (#'chain-filter/chain-filter-mbql-query field-id constraints nil)
  (lib-be/with-metadata-provider-cache
    {:first  (t2/with-call-count [call-count] (#'chain-filter/chain-filter-mbql-query field-id constraints nil) (call-count))
     :second (t2/with-call-count [call-count] (#'chain-filter/chain-filter-mbql-query field-id constraints nil) (call-count))}))

(deftest ^:parallel chain-filter-mbql-query-no-constraints-test
  (mt/dataset test-data
    (mt/$ids
      (let [{:keys [first second]} (chain-filter-mbql-query-call-counts %venues.name [])]
        ;; - fetch the source Field (the one we return values of)
        ;; - fetch the source Table
        ;; - fetch the Database
        (is (= 3 first))
        (testing "a second build reuses the cached metadata and makes no app-DB calls"
          (is (= 0 second)))))))

(deftest ^:parallel chain-filter-mbql-query-one-constraint-test
  (mt/dataset test-data
    (mt/$ids
      ;; a constraint on the source Table does not add a join
      (let [{:keys [first second]} (chain-filter-mbql-query-call-counts %venues.name [(shorthand->constraint %venues.price 3)])]
        ;; - fetch the source Field
        ;; - fetch the source Table
        ;; - fetch the Database
        ;; - bulk-fetch the constraint Field(s)
        (is (= 4 first))
        (testing "a second build reuses the cached metadata and makes no app-DB calls"
          (is (= 0 second)))))))

(deftest ^:parallel chain-filter-mbql-query-three-constraints-test
  (mt/dataset test-data
    (mt/$ids
      (let [{:keys [first second]} (chain-filter-mbql-query-call-counts
                                    %venues.name
                                    [(shorthand->constraint %venues.price 3)
                                     (shorthand->constraint %venues.id 1)
                                     (shorthand->constraint %venues.latitude 1)])]
        ;; same as the one-constraint case -- the constraint Fields are bulk-loaded together, not one at a time:
        ;; - fetch the source Field
        ;; - fetch the source Table
        ;; - fetch the Database
        ;; - bulk-fetch the (three) constraint Fields
        (is (= 4 first))
        (testing "a second build reuses the cached metadata and makes no app-DB calls"
          (is (= 0 second)))))))

(deftest ^:parallel chain-filter-mbql-query-one-join-test
  (mt/dataset test-data
    (mt/$ids
      ;; a constraint on another Table (categories) forces a venues -> categories join
      (let [{:keys [first second]} (chain-filter-mbql-query-call-counts %venues.name [(shorthand->constraint %categories.name "BBQ")])]
        ;; - fetch the source Field
        ;; - fetch the source Table
        ;; - fetch the Database
        ;; - bulk-fetch the constraint Field(s)
        ;; - bulk-fetch the join Fields
        ;; - bulk-fetch the join Table(s)
        (is (= 6 first))
        (testing "a second build reuses the cached metadata and makes no app-DB calls"
          (is (= 0 second)))))))

(deftest ^:parallel chain-filter-mbql-query-multi-hop-joins-test
  (mt/dataset airports
    (mt/$ids
      ;; airport -> municipality -> region is two joins
      (let [{:keys [first second]} (chain-filter-mbql-query-call-counts %airport.name [(shorthand->constraint %region.name "x")])]
        ;; same count as the single-join case -- the join Fields and Tables are each bulk-loaded in one call,
        ;; regardless of how many joins there are:
        ;; - fetch the source Field
        ;; - fetch the source Table
        ;; - fetch the Database
        ;; - bulk-fetch the constraint Field(s)
        ;; - bulk-fetch the join Fields (across both joins)
        ;; - bulk-fetch the join Tables (both of them)
        (is (= 6 first))
        (testing "a second build reuses the cached metadata and makes no app-DB calls"
          (is (= 0 second)))))))
