(ns metabase.models.params.chain-filter-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.models :refer [Field FieldValues]]
   [metabase.models.field-values :as field-values]
   [metabase.models.params.chain-filter :as chain-filter]
   [metabase.models.params.field-values :as params.field-values]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn shorthand->constraint [field-id v]
  (if-not (vector? v)
    {:field-id field-id
     :op       :=
     :value    v}
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

(deftest chain-filter-test
  (testing "Show me expensive restaurants"
    (is (= {:values          [["Dal Rae Restaurant"]
                              ["Lawry's The Prime Rib"]
                              ["Pacific Dining Car - Santa Monica"]
                              ["Sushi Nakazawa"]
                              ["Sushi Yasuda"]
                              ["Tanoshi Sushi & Sake Bar"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price 4}))))
  (testing "Show me categories that have expensive restaurants"
    (is (= {:values          [["Japanese"] ["Steakhouse"]]
            :has_more_values false}
           (chain-filter categories.name {venues.price 4})))
    (testing "Should work with string versions of param values"
      (is (= {:values          [["Japanese"] ["Steakhouse"]]
              :has_more_values false}
             (chain-filter categories.name {venues.price "4"})))))
  (testing "Show me categories starting with s (case-insensitive) that have expensive restaurants"
    (is (= {:values          [["Steakhouse"]]
            :has_more_values false}
           (chain-filter categories.name {venues.price 4, categories.name [:starts-with "s" {:case-sensitive false}]}))))
  (testing "Show me cheap Thai restaurants"
    (is (= {:values          [["Kinaree Thai Bistro"] ["Krua Siri"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price 1, categories.name "Thai"}))))
  (testing "Show me the categories that have cheap restaurants"
    (is (= {:values          [["Asian"] ["BBQ"] ["Bakery"] ["Bar"] ["Burger"] ["Caribbean"] ["Deli"]
                              ["Karaoke"] ["Mexican"] ["Pizza"] ["Southern"] ["Thai"]]
            :has_more_values false}
           (chain-filter categories.name {venues.price 1}))))
  (testing "Show me cheap restaurants with the word 'taco' in their name (case-insensitive)"
    (is (= {:values          [["Tacos Villa Corona"] ["Tito's Tacos"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price 1, venues.name [:contains "tAcO" {:case-sensitive false}]}))))
  (testing "Show me the first 3 expensive restaurants"
    (is (= {:values          [["Dal Rae Restaurant"] ["Lawry's The Prime Rib"] ["Pacific Dining Car - Santa Monica"]]
            :has_more_values true}
           (chain-filter venues.name {venues.price 4} :limit 3))))
  (testing "Oh yeah, we actually support arbitrary MBQL filter clauses. Neat!"
    (is (= {:values          [["Festa"] ["Fred 62"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price [:between 2 3]
                                      venues.name  [:starts-with "f" {:case-sensitive false}]})))))

(deftest multiple-values-test
  (testing "Chain filtering should support multiple values for a single parameter (as a vector or set of values)"
    (testing "Show me restaurants with price = 1 or 2 with the word 'BBQ' in their name (case-sensitive)"
      (is (= {:values          [["Baby Blues BBQ"] ["Beachwood BBQ & Brewing"] ["Bludso's BBQ"]]
              :has_more_values false}
             (chain-filter venues.name {venues.price #{1 2}, venues.name [:contains "BBQ"]}))))
    (testing "Show me the possible values of price for Bakery *or* BBQ restaurants"
      (is (= {:values          [[1] [2] [3]]
              :has_more_values false}
             (chain-filter venues.price {categories.name ["Bakery" "BBQ"]}))))))

(deftest auto-parse-string-params-test
  (testing "Parameters that come in as strings (i.e., all of them that come in via the API) should work as intended"
    (is (= {:values          [["Baby Blues BBQ"] ["Beachwood BBQ & Brewing"] ["Bludso's BBQ"]]
            :has_more_values false}
           (chain-filter venues.name {venues.price ["1" "2"], venues.name [:contains "BBQ"]})))))

(deftest unrelated-params-test
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

(deftest traverse-graph-test
  (testing "If no need to join, returns immediately"
    (is (nil? (#'chain-filter/traverse-graph {} :start :start 5))))
  (testing "Finds a simple hop"
    (let [graph {:start {:end [:start->end]}}]
      (is (= [:start->end]
             (#'chain-filter/traverse-graph graph :start :end 5))))
    (testing "Finds over a few hops"
      (let [graph {:start {:a [:start->a]}
                   :a     {:b [:a->b]}
                   :b     {:c [:b->c]}
                   :c     {:end [:c->end]}}]
        (is (= [:start->a :a->b :b->c :c->end]
               (#'chain-filter/traverse-graph graph :start :end 5)))
        (testing "But will not exceed the max depth"
          (is (nil? (#'chain-filter/traverse-graph graph :start :end 2))))))
    (testing "Can find a path in a dense and large graph"
      (is (= [[:start 50] [50 :end]]
             (#'chain-filter/traverse-graph megagraph :start :end 5)))
      (is (= [[:start 90] [90 200] [200 :end]]
             (#'chain-filter/traverse-graph megagraph-single-path :start :end 5))))
    (testing "Returns nil if there is no path"
      (let [graph {:start {1 [[:start 1]]}
                   1      {2 [[1 2]]}
                   ;; no way to get to 3
                   3      {4 [[3 4]]}
                   4      {:end [[4 :end]]}}]
        (is (nil? (#'chain-filter/traverse-graph graph :start :end 5)))))
    (testing "Not fooled by loops"
      (let [graph {:start {:a [:start->a]}
                   :a     {:b [:a->b]
                           :a [:b->a]}
                   :b     {:c [:b->c]
                           :a [:c->a]
                           :b [:c->b]}
                   :c     {:end [:c->end]}}]
        (is (= [:start->a :a->b :b->c :c->end]
               (#'chain-filter/traverse-graph graph :start :end 5)))
        (testing "But will not exceed the max depth"
          (is (nil? (#'chain-filter/traverse-graph graph :start :end 2))))))))

(deftest find-joins-test
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport -> municipality"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                 :rhs {:table $$municipality, :field %municipality.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$municipality))))
      (testing "airport [-> municipality -> region] -> country"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                 :rhs {:table $$municipality, :field %municipality.id}}
                {:lhs {:table $$municipality, :field %municipality.region_id}
                 :rhs {:table $$region, :field %region.id}}
                {:lhs {:table $$region, :field %region.country_id}
                 :rhs {:table $$country, :field %country.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$country))))
      (testing "[backwards]"
        (testing "municipality -> airport"
          (is (= [{:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality_id}}]
                 (#'chain-filter/find-joins (mt/id) $$municipality $$airport))))
        (testing "country [-> region -> municipality] -> airport"
          (is (= [{:lhs {:table $$country, :field %country.id}
                   :rhs {:table $$region, :field %region.country_id}}
                  {:lhs {:table $$region, :field %region.id}
                   :rhs {:table $$municipality, :field %municipality.region_id}}
                  {:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality_id}}]
                 (#'chain-filter/find-joins (mt/id) $$country $$airport))))))))

(deftest find-all-joins-test
  (testing "With reverse joins disabled"
    (binding [chain-filter/*enable-reverse-joins* false]
      (mt/$ids nil
        (is (= [{:lhs {:table $$venues, :field %venues.category_id}, :rhs {:table $$categories, :field %categories.id}}]
               (#'chain-filter/find-all-joins $$venues #{%categories.name %users.id}))))))
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport [-> municipality] -> region"
        (testing "even though we're joining against the same Table multiple times, duplicate joins should be removed"
          (is (= [{:lhs {:table $$airport, :field %airport.municipality_id}
                   :rhs {:table $$municipality, :field %municipality.id}}
                  {:lhs {:table $$municipality, :field %municipality.region_id}
                   :rhs {:table $$region, :field %region.id}}]
                 (#'chain-filter/find-all-joins $$airport #{%region.name %municipality.name %region.id}))))))))

(deftest multi-hop-test
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "single direct join: Airport -> Municipality"
        (is (= {:values          [["San Francisco International Airport"]]
                :has_more_values false}
               (chain-filter airport.name {municipality.name ["San Francisco"]}))))
      (testing "2 joins required: Airport -> Municipality -> Region"
        (is (= {:values          [["Beale Air Force Base"]
                                  ["Edwards Air Force Base"]
                                  ["John Wayne Airport-Orange County Airport"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {region.name ["California"]})))))
      (testing "3 joins required: Airport -> Municipality -> Region -> Country"
        (is (= {:values          [["Abraham Lincoln Capital Airport"]
                                  ["Albuquerque International Sunport"]
                                  ["Altus Air Force Base"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {country.name ["United States"]})))))
      (testing "4 joins required: Airport -> Municipality -> Region -> Country -> Continent"
        (is (= {:values          [["Afonso Pena Airport"]
                                  ["Alejandro Velasco Astete International Airport"]
                                  ["Carrasco International /General C L Berisso Airport"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter airport.name {continent.name ["South America"]})))))
      (testing "[backwards]"
        (testing "single direct join: Municipality -> Airport"
          (is (= {:values          [["San Francisco"]]
                  :has_more_values false}
                 (chain-filter municipality.name {airport.name ["San Francisco International Airport"]}))))
        (testing "2 joins required: Region -> Municipality -> Airport"
          (is (= {:values          [["California"]]
                  :has_more_values false}
                 (chain-filter region.name {airport.name ["San Francisco International Airport"]}))))
        (testing "3 joins required: Country -> Region -> Municipality -> Airport"
          (is (= {:values          [["United States"]]
                  :has_more_values false}
                 (chain-filter country.name {airport.name ["San Francisco International Airport"]}))))
        (testing "4 joins required: Continent -> Region -> Municipality -> Airport"
          (is (= {:values          [["North America"]]
                  :has_more_values false}
                 (chain-filter continent.name {airport.name ["San Francisco International Airport"]}))))))))

(deftest filterable-field-ids-test
  (mt/$ids
    (testing (format "venues.price = %d categories.name = %d users.id = %d\n" %venues.price %categories.name %users.id)
      (is (= #{%categories.name %users.id}
             (chain-filter/filterable-field-ids %venues.price #{%categories.name %users.id})))
      (testing "reverse joins disabled: should exclude users.id"
        (binding [chain-filter/*enable-reverse-joins* false]
          (is (= #{%categories.name}
                 (chain-filter/filterable-field-ids %venues.price #{%categories.name %users.id})))))
      (testing "return nil if filtering-field-ids is empty"
        (is (= nil
               (chain-filter/filterable-field-ids %venues.price #{})))))))

(deftest chain-filter-search-test
  (testing "Show me categories containing 'eak' (case-insensitive) that have expensive restaurants"
    (is (= {:values          [["Steakhouse"]]
            :has_more_values false}
           (chain-filter-search categories.name {venues.price 4} "eak"))))
  (testing "Show me cheap restaurants including with 'taco' (case-insensitive)"
    (is (= {:values          [["Tacos Villa Corona"] ["Tito's Tacos"]]
            :has_more_values false}
           (chain-filter-search venues.name {venues.price 1} "tAcO"))))
  (testing "search for something crazy = should return empty results"
    (is (= {:values          []
            :has_more_values false}
           (chain-filter-search categories.name {venues.price 4} "zzzzz"))))
  (testing "Field that doesn't exist should throw a 404"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Field [\d,]+ does not exist"
         (chain-filter/chain-filter-search Integer/MAX_VALUE nil "s"))))
  (testing "Field that isn't type/Text should throw a 400"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cannot search against non-Text Field"
         (chain-filter/chain-filter-search (mt/$ids %venues.price) nil "s")))))


;;; --------------------------------------------------- Remapping ----------------------------------------------------

(defn do-with-human-readable-values-remapping [thunk]
  (mt/with-column-remappings [venues.category_id (values-of categories.name)]
    (thunk)))

(defmacro with-human-readable-values-remapping {:style/indent 0} [& body]
  `(do-with-human-readable-values-remapping (fn [] ~@body)))

(deftest human-readable-values-remapped-chain-filter-test
  (with-human-readable-values-remapping
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
  (with-human-readable-values-remapping
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

(deftest field-to-field-remapped-field-id-test
  (is (= (mt/id :venues :name)
         (#'chain-filter/remapped-field-id (mt/id :venues :id)))))

(deftest field-to-field-remapped-chain-filter-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs (names)"
      (is (= {:values [[29 "20th Century Cafe"]
                       [8 "25°"]
                       [93 "33 Taps"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.id nil)))))
    (testing "Show me expensive venue IDs (names)"
      (is (= {:values          [[55 "Dal Rae Restaurant"]
                                [61 "Lawry's The Prime Rib"]
                                [16 "Pacific Dining Car - Santa Monica"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter venues.id {venues.price 4})))))))

(deftest field-to-field-remapped-chain-filter-search-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs that [have a remapped name that] contains 'sushi'"
      (is (= {:values          [[76 "Beyond Sushi"]
                                [80 "Blue Ribbon Sushi"]
                                [77 "Sushi Nakazawa"]]
              :has_more_values false}
             (take-n-values 3 (chain-filter-search venues.id nil "sushi")))))
    (testing "Show me venue IDs that [have a remapped name that] contain 'sushi' that are expensive"
      (is (= {:values          [[77 "Sushi Nakazawa"]
                                [79 "Sushi Yasuda"]
                                [81 "Tanoshi Sushi & Sake Bar"]]
              :has_more_values false}
             (chain-filter-search venues.id {venues.price 4} "sushi"))))
    (testing "search for something crazy = should return empty results"
      (is (= {:values          []
              :has_more_values false}
             (chain-filter-search venues.id {venues.price 4} "zzzzz"))))))

(defmacro with-fk-field-to-field-remapping {:style/indent 0} [& body]
  `(mt/with-column-remappings [~'venues.category_id ~'categories.name]
     ~@body))

(deftest fk-field-to-field-remapped-field-id-test
  (with-fk-field-to-field-remapping
    (is (= (mt/id :categories :name)
           (#'chain-filter/remapped-field-id (mt/id :venues :category_id))))))

(deftest fk-field-to-field-remapped-chain-filter-test
  (with-fk-field-to-field-remapping
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
  (with-fk-field-to-field-remapping
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

(deftest use-cached-field-values-test
  (testing "chain-filter should use cached FieldValues if applicable (#13832)"
    (let [field-id (mt/id :categories :name)]
      (mt/with-model-cleanup [FieldValues]
        (testing "should created a full FieldValues when constraints is `nil`"
          ;; warm up the cache
          (chain-filter categories.name nil)
          (with-redefs [params.field-values/prepare-advanced-field-values (fn [& _args]
                                                                            (assert false "Should not be called"))]
            (is (= {:values          [["African"] ["American"] ["Artisan"]]
                    :has_more_values false}
                   (take-n-values 3 (chain-filter categories.name nil))))
            (is (= 1 (t2/count FieldValues :field_id field-id :type :full)))))

        (testing "should create a linked-filter FieldValues when have constraints"
          ;; make sure we have a clean start
          (field-values/clear-advanced-field-values-for-field! field-id)
          ;; warm up the cache
          (chain-filter categories.name {venues.price 4})
          (with-redefs [params.field-values/prepare-advanced-field-values (fn [& _args]
                                                                            (assert false "Should not be called"))]
            (is (= {:values          [["Japanese"] ["Steakhouse"]]
                    :has_more_values false}
                   (chain-filter categories.name {venues.price 4})))
            (is (= 1 (t2/count FieldValues :field_id field-id :type :linked-filter)))))

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
            (is (= 1 (t2/count FieldValues :field_id field-id :type "linked-filter"))))

          (testing "should search for the values of linked-filter FieldValues"
            (t2/update! FieldValues {:field_id field-id
                                     :type     "linked-filter"}
                        {:values (json/generate-string ["Good" "Bad"])
                         ;; HACK: currently this is hardcoded to true for linked-filter
                         ;; in [[params.field-values/fetch-advanced-field-values]]
                         ;; we want this to false to test this case
                         :has_more_values false})
            (is (= {:values          [["Good"]]
                    :has_more_values false}
                   (chain-filter-search categories.name {venues.price 4} "o")))
            (testing "Shouldn't use cached FieldValues if has_more_values=true"
              (t2/update! FieldValues {:field_id field-id
                                       :type     "linked-filter"}
                          {:has_more_values true})
              (is (= {:values          [["Steakhouse"]]
                      :has_more_values false}
                     (chain-filter-search categories.name {venues.price 4} "o"))))))))))

(deftest use-cached-field-values-for-remapped-field-test
  (testing "fetching a remapped field should returns remapped values (#21528)"
    (mt/with-discard-model-updates [:model/Field]
      (t2/update! :model/Field (mt/id :venues :category_id) {:has_field_values "list"})
      (mt/with-column-remappings [venues.category_id categories.name]
        (is (= {:values          [[2 "American"] [3 "Artisan"] [4 "Asian"]]
                :has_more_values false}
               (take-n-values 3 (chain-filter/chain-filter (mt/id :venues :category_id) nil))))

        (is (= {:values          [[4 "Asian"]]
                :has_more_values false}
               (chain-filter/chain-filter-search (mt/id :venues :category_id) nil "sian")))))))

(deftest time-interval-test
  (testing "chain-filter should accept time interval strings like `past32weeks` for temporal Fields"
    (mt/$ids
      (is (= [:time-interval $checkins.date -32 :week {:include-current false}]
             (#'chain-filter/filter-clause $$checkins {:field-id %checkins.date
                                                       :op       :=
                                                       :value    "past32weeks"}))))))

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
                      ;; the case, but that's not important for this test anyway. Just sort everything
                      (is (= expected-values
                             (update (chain-filter/chain-filter (mt/id :tbl field) []) :values sort))))
                    (testing "chain-filter-search"
                      (is (= {:values          [["value"]]
                              :has_more_values false}
                             (chain-filter/chain-filter-search (mt/id :tbl field) [] "val"))))))]
          (testing "no FieldValues"
            (thunk))
          (testing "with FieldValues for myfield"
            (t2.with-temp/with-temp [FieldValues _ {:field_id %myfield, :values ["value" nil ""]}]
              (mt/with-temp-vals-in-db Field %myfield {:has_field_values "auto-list"}
                (testing "Sanity check: make sure we will actually use the cached FieldValues"
                  (is (field-values/field-should-have-field-values? %myfield))
                  (is (#'chain-filter/use-cached-field-values? %myfield)))
                (thunk)))))))))

(defn- do-with-clean-field-values-for-field
  [field-or-field-id thunk]
  (mt/with-model-cleanup [FieldValues]
    (let [field-id         (u/the-id field-or-field-id)
          has_field_values (t2/select-one-fn :has_field_values Field :id field-id)
          fvs              (t2/select FieldValues :field_id field-id)]
      ;; switch to "list" to prevent [[field-values/create-or-update-full-field-values!]]
      ;; from changing this to `nil` if the field is `auto-list` and exceeds threshholds
      (t2/update! Field field-id {:has_field_values "list"})
      (t2/delete! FieldValues :field_id field-id)
      (try
        (thunk)
        (finally
         (t2/update! Field field-id {:has_field_values has_field_values})
         (t2/insert! FieldValues fvs))))))

(defmacro ^:private with-clean-field-values-for-field
  "Run `body` with all FieldValues for `field-id` deleted.
  Restores the deleted FieldValues when we're done."
  {:style/indent 1}
  [field-or-field-id & body]
  `(do-with-clean-field-values-for-field ~field-or-field-id (fn [] ~@body)))

(deftest chain-filter-has-more-values-test
  (testing "the `has_more_values` property should be correct\n"
    (testing "for cached fields"
      (testing "without contraints"
        (with-clean-field-values-for-field (mt/id :categories :name)
          (testing "`false` for field has values less than [[field-values/*total-max-length*]] threshold"
            (is (= false
                   (:has_more_values (chain-filter categories.name {})))))

          (testing "`true` if the limit option is less than the count of values of fieldvalues"
            (is (= true
                   (:has_more_values (chain-filter categories.name {} :limit 1)))))
          (testing "`false` if the limit option is greater the count of values of fieldvalues"
            (is (= false
                   (:has_more_values (chain-filter categories.name {} :limit Integer/MAX_VALUE))))))

        (testing "`true` if the values of a field exceeds our [[field-values/*total-max-length*]] limit"
          (with-clean-field-values-for-field (mt/id :categories :name)
            (binding [field-values/*total-max-length* 10]
              (is (= true
                     (:has_more_values (chain-filter categories.name {}))))))))

      (testing "with contraints"
        (with-clean-field-values-for-field (mt/id :categories :name)
          (testing "`false` for field has values less than [[field-values/*total-max-length*]] threshold"
            (is (= false
                   (:has_more_values (chain-filter categories.name {venues.price 4})))))

          (testing "`true` if the limit option is less than the count of values of fieldvalues"
            (is (= true
                   (:has_more_values (chain-filter categories.name {venues.price 4} :limit 1)))))
          (testing "`false` if the limit option is greater the count of values of fieldvalues"
            (is (= false
                   (:has_more_values (chain-filter categories.name {venues.price 4} :limit Integer/MAX_VALUE))))))

        (with-clean-field-values-for-field (mt/id :categories :name)
          (testing "`true` if the values of a field exceeds our [[field-values/*total-max-length*]] limit"
              (binding [field-values/*total-max-length* 10]
                (is (= true
                       (:has_more_values (chain-filter categories.name {venues.price 4})))))))))

    (testing "for non-cached fields"
      (testing "with contraints"
        (with-clean-field-values-for-field (mt/id :venues :latitude)
          (testing "`false` if we don't specify limit"
            (is (= false
                   (:has_more_values (chain-filter venues.latitude {venues.price 4})))))

          (testing "`true` if the limit is less than the number of values the field has"
            (is (= true
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
        (mt/with-dynamic-redefs [chain-filter/database-fk-relationships @#'chain-filter/database-fk-relationships*
                                 chain-filter/find-joins                (fn
                                                                          ([a b c]
                                                                           (#'chain-filter/find-joins* a b c false))
                                                                          ([a b c d]
                                                                           (#'chain-filter/find-joins* a b c d)))]
          (testing "receiver_id is active and should be used for the join"
            (is (= [{:lhs {:table $$messages, :field %messages.receiver_id}
                     :rhs {:table $$users, :field %users.id}}]
                   (#'chain-filter/find-joins (mt/id) $$messages $$users))))

          (try
            (t2/update! :model/Field {:id %messages.receiver_id} {:active false})
            (testing "check that it switches to sender once receiver is inactive"
              (is (= [{:lhs {:table $$messages, :field %messages.sender_id}
                       :rhs {:table $$users, :field %users.id}}]
                     (#'chain-filter/find-joins (mt/id) $$messages $$users))))
            (finally
              (t2/update! :model/Field {:id %messages.receiver_id} {:active true})))

          ;; mark field
          (t2/update! :model/Field {:id %users.id} {:active false})
          (testing "there are no connections when PK is inactive"
            (is (nil? (#'chain-filter/find-joins (mt/id) $$messages $$users)))))))))
