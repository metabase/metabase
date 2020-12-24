(ns metabase.models.params.chain-filter-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Dimension FieldValues]]
             [test :as mt]]
            [metabase.models.params.chain-filter :as chain-filter]))

(defmacro chain-filter [field field->value & options]
  `(chain-filter/chain-filter
    (mt/$ids nil ~(symbol (str \% (name field))))
    (mt/$ids nil ~(into {} (for [[k v] field->value]
                             [(symbol (str \% k)) v])))
    ~@options))

(deftest chain-filter-test
  (testing "Show me expensive restaurants"
    (is (= ["Dal Rae Restaurant"
            "Lawry's The Prime Rib"
            "Pacific Dining Car - Santa Monica"
            "Sushi Nakazawa"
            "Sushi Yasuda"
            "Tanoshi Sushi & Sake Bar"]
           (chain-filter venues.name {venues.price 4}))))
  (testing "Show me categories that have expensive restaurants"
    (is (= ["Japanese" "Steakhouse"]
           (chain-filter categories.name {venues.price 4})))
    (testing "Should work with string versions of param values"
      (is (= ["Japanese" "Steakhouse"]
             (chain-filter categories.name {venues.price "4"})))))
  (testing "Show me categories starting with s (case-insensitive) that have expensive restaurants"
    (is (= ["Steakhouse"]
           (chain-filter categories.name {venues.price 4, categories.name [:starts-with "s" {:case-sensitive false}]}))))
  (testing "Show me cheap Thai restaurants"
    (is (= ["Kinaree Thai Bistro" "Krua Siri"]
           (chain-filter venues.name {venues.price 1, categories.name "Thai"}))))
  (testing "Show me the categories that have cheap restaurants"
    (is (= ["Asian" "BBQ" "Bakery" "Bar" "Burger" "Caribbean" "Deli" "Karaoke" "Mexican" "Pizza" "Southern" "Thai"]
           (chain-filter categories.name {venues.price 1}))))
  (testing "Show me cheap restaurants with the word 'taco' in their name (case-insensitive)"
    (is (= ["Tacos Villa Corona" "Tito's Tacos"]
           (chain-filter venues.name {venues.price 1, venues.name [:contains "tAcO" {:case-sensitive false}]}))))
  (testing "Show me the first 3 expensive restaurants"
    (is (= ["Dal Rae Restaurant" "Lawry's The Prime Rib" "Pacific Dining Car - Santa Monica"]
           (chain-filter venues.name {venues.price 4} :limit 3))))
  (testing "Oh yeah, we actually support arbitrary MBQL filter clauses. Neat!"
    (is (= ["Festa" "Fred 62"]
           (chain-filter venues.name {venues.price [:between 2 3]
                                      venues.name  [:starts-with "f" {:case-sensitive false}]})))))

(deftest multiple-values-test
  (testing "Chain filtering should support multiple values for a single parameter (as a vector or set of values)"
    (testing "Show me restaurants with price = 1 or 2 with the word 'BBQ' in their name (case-sensitive)"
      (is (= ["Baby Blues BBQ" "Beachwood BBQ & Brewing" "Bludso's BBQ"]
             (chain-filter venues.name {venues.price #{1 2}, venues.name [:contains "BBQ"]}))))
    (testing "Show me the possible values of price for Bakery *or* BBQ restaurants"
      (is (= [1 2 3]
             (chain-filter venues.price {categories.name ["Bakery" "BBQ"]}))))))

(deftest auto-parse-string-params-test
  (testing "Parameters that come in as strings (i.e., all of them that come in via the API) should work as intended"
    (is (= ["Baby Blues BBQ" "Beachwood BBQ & Brewing" "Bludso's BBQ"]
           (chain-filter venues.name {venues.price ["1" "2"], venues.name [:contains "BBQ"]})))))

(deftest unrelated-params-test
  (testing "Parameters that are completely unrelated (don't apply to this Table) should just get ignored entirely"
    ;; there is no way to join from venues -> users so users.id should get ignored
    (binding [chain-filter/*enable-reverse-joins* false]
      (is (= [1 2 3]
             (chain-filter venues.price {categories.name ["Bakery" "BBQ"]
                                         users.id        [1 2 3]}))))))

(deftest find-joins-test
  (mt/dataset airports
    (mt/$ids nil
      (testing "airport -> municipality"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality-id}
                 :rhs {:table $$municipality, :field %municipality.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$municipality))))
      (testing "airport [-> municipality -> region] -> country"
        (is (= [{:lhs {:table $$airport, :field %airport.municipality-id}
                 :rhs {:table $$municipality, :field %municipality.id}}
                {:lhs {:table $$municipality, :field %municipality.region-id}
                 :rhs {:table $$region, :field %region.id}}
                {:lhs {:table $$region, :field %region.country-id}
                 :rhs {:table $$country, :field %country.id}}]
               (#'chain-filter/find-joins (mt/id) $$airport $$country))))
      (testing "[backwards]"
        (testing "municipality -> airport"
          (is (= [{:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality-id}}]
                 (#'chain-filter/find-joins (mt/id) $$municipality $$airport))))
        (testing "country [-> region -> municipality] -> airport"
          (is (= [{:lhs {:table $$country, :field %country.id}
                   :rhs {:table $$region, :field %region.country-id}}
                  {:lhs {:table $$region, :field %region.id}
                   :rhs {:table $$municipality, :field %municipality.region-id}}
                  {:lhs {:table $$municipality, :field %municipality.id}
                   :rhs {:table $$airport, :field %airport.municipality-id}}]
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
          (is (= [{:lhs {:table $$airport, :field %airport.municipality-id}
                   :rhs {:table $$municipality, :field %municipality.id}}
                  {:lhs {:table $$municipality, :field %municipality.region-id}
                   :rhs {:table $$region, :field %region.id}}]
                 (#'chain-filter/find-all-joins $$airport #{%region.name %municipality.name %region.id}))))))))

(deftest multi-hop-test
  (mt/dataset airports
    (testing "Should be able to filter against other tables with that require multiple joins\n"
      (testing "single direct join: Airport -> Municipality"
        (is (= ["San Francisco International Airport"]
               (chain-filter airport.name {municipality.name ["San Francisco"]}))))
      (testing "2 joins required: Airport -> Municipality -> Region"
        (is (= ["Beale Air Force Base"
                "Edwards Air Force Base"
                "John Wayne Airport-Orange County Airport"]
               (take 3 (chain-filter airport.name {region.name ["California"]})))))
      (testing "3 joins required: Airport -> Municipality -> Region -> Country"
        (is (= ["Abraham Lincoln Capital Airport"
                "Albuquerque International Sunport"
                "Altus Air Force Base"]
               (take 3 (chain-filter airport.name {country.name ["United States"]})))))
      (testing "4 joins required: Airport -> Municipality -> Region -> Country -> Continent"
        (is (= ["Afonso Pena Airport"
                "Alejandro Velasco Astete International Airport"
                "Carrasco International /General C L Berisso Airport"]
               (take 3 (chain-filter airport.name {continent.name ["South America"]})))))
      (testing "[backwards]"
        (testing "single direct join: Municipality -> Airport"
          (is (= ["San Francisco"]
                 (chain-filter municipality.name {airport.name ["San Francisco International Airport"]}))))
        (testing "2 joins required: Region -> Municipality -> Airport"
          (is (= ["California"]
                 (chain-filter region.name {airport.name ["San Francisco International Airport"]}))))
        (testing "3 joins required: Country -> Region -> Municipality -> Airport"
          (is (= ["United States"]
                 (chain-filter country.name {airport.name ["San Francisco International Airport"]}))))
        (testing "4 joins required: Continent -> Region -> Municipality -> Airport"
          (is (= ["North America"]
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
  (testing "Show me categories starting with s (case-insensitive) that have expensive restaurants"
    (is (= ["Steakhouse"]
           (mt/$ids (chain-filter/chain-filter-search %categories.name {%venues.price 4} "s")))))
  (testing "Show me cheap restaurants starting with 'taco' (case-insensitive)"
    (is (= ["Tacos Villa Corona"]
           (mt/$ids (chain-filter/chain-filter-search %venues.name {%venues.price 1} "tAcO")))))
  (testing "search for something crazy = should return empty results"
    (is (= []
           (mt/$ids (chain-filter/chain-filter-search %categories.name {%venues.price 4} "zzzzz")))))
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
  (let [ids-and-names (mt/rows (mt/run-mbql-query categories {:fields [$id $name], :order-by [[:asc $id]]}))]
    (mt/with-temp FieldValues [_ {:field_id              (mt/id :venues :category_id)
                                  :values                (map first ids-and-names)
                                  :human_readable_values (map second ids-and-names)}]
      (testing "\nvenues.category_id given human-readable values based on matching category name\n"
        (thunk)))))

(defmacro with-human-readable-values-remapping {:style/indent 0} [& body]
  `(do-with-human-readable-values-remapping (fn [] ~@body)))

(deftest human-readable-values-remapped-chain-filter-test
  (with-human-readable-values-remapping
    (testing "Show me category IDs for categories"
      ;; there are no restaurants with category 1
      (is (= [[2 "American"]
              [3 "Artisan"]
              [4 "Asian"]]
             (take 3 (mt/$ids (chain-filter/chain-filter %venues.category_id nil))))))
    (testing "Show me category IDs for categories that have expensive restaurants"
      (is (= [[40 "Japanese"]
              [67 "Steakhouse"]]
             (mt/$ids (chain-filter/chain-filter %venues.category_id {%venues.price 4})))))
    (testing "Show me the category 40 (constraints do not support remapping)"
      (is (= [[40 "Japanese"]]
             (mt/$ids (chain-filter/chain-filter %venues.category_id {%venues.category_id 40})))))))

(deftest human-readable-values-remapped-chain-filter-search-test
  (with-human-readable-values-remapping
    (testing "Show me category IDs [whose name] starts with s"
      (doseq [constraints [nil {}]]
        (testing (format "\nconstraints = %s" (pr-str constraints))
          (is (= [[64 "Southern"]
                  [67 "Steakhouse"]]
                 (mt/$ids (chain-filter/chain-filter-search %venues.category_id constraints "s")))))))
    (testing "Show me category IDs [whose name] starts with s that have expensive restaurants"
      (is (= [[67 "Steakhouse"]]
             (mt/$ids (chain-filter/chain-filter-search %venues.category_id {%venues.price 4} "s")))))
    (testing "search for something crazy: should return empty results"
      (is (= []
             (mt/$ids (chain-filter/chain-filter-search %venues.category_id {%venues.price 4} "zzzzz")))))))

(deftest field-to-field-remapped-field-id-test
  (is (= (mt/id :venues :name)
         (#'chain-filter/remapped-field-id (mt/id :venues :id)))))

(deftest field-to-field-remapped-chain-filter-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs (names)"
      (is (= [[29 "20th Century Cafe"]
              [ 8 "25°"              ]
              [93 "33 Taps"          ]]
             (take 3 (chain-filter/chain-filter (mt/id :venues :id) nil)))))
    (testing "Show me expensive venue IDs (names)"
      (is (= [[55 "Dal Rae Restaurant"]
              [61 "Lawry's The Prime Rib"]
              [16 "Pacific Dining Car - Santa Monica"]]
             (take 3 (mt/$ids (chain-filter/chain-filter %venues.id {%venues.price 4}))))))))

(deftest field-to-field-remapped-chain-filter-search-test
  (testing "Field-to-field remapping: venues.category_id -> categories.name\n"
    (testing "Show me venue IDs that [have a remapped name that] start with s"
      (is (= [[90 "Señor Fish"]
              [46 "Shanghai Dumpling King"]
              [65 "Slate"]]
             (take 3 (chain-filter/chain-filter-search (mt/id :venues :id) nil "s")))))
    (testing "Show me venue IDs that [have a remapped name that] start with s that are expensive"
      (is (= [[77 "Sushi Nakazawa"]
              [79 "Sushi Yasuda"]]
             (mt/$ids (chain-filter/chain-filter-search %venues.id {%venues.price 4} "s")))))
    (testing "search for something crazy = should return empty results"
      (is (= []
             (mt/$ids (chain-filter/chain-filter-search %venues.id {%venues.price 4} "zzzzz")))))))

(defn do-with-fk-field-to-field-remapping [thunk]
  (mt/with-temp Dimension [_ {:field_id                (mt/id :venues :category_id)
                              :type                    "external"
                              :name                    "Category"
                              :human_readable_field_id (mt/id :categories :name)}]
    (testing (format "\nvenues.category_id FK Field %d -> Field remapped to categories.name %d\n"
                     (mt/id :venues :category_id)
                     (mt/id :categories :name))
      (thunk))))

(defmacro with-fk-field-to-field-remapping {:style/indent 0} [& body]
  `(do-with-fk-field-to-field-remapping (fn [] ~@body)))

(deftest fk-field-to-field-remapped-field-id-test
  (with-fk-field-to-field-remapping
    (is (= (mt/id :categories :name)
           (#'chain-filter/remapped-field-id (mt/id :venues :category_id))))))

(deftest fk-field-to-field-remapped-chain-filter-test
  (with-fk-field-to-field-remapping
    (testing "Show me category IDs for categories"
      ;; there are no restaurants with category 1
      (is (= [[2 "American"]
              [3 "Artisan"]
              [4 "Asian"]]
             (take 3 (mt/$ids (chain-filter/chain-filter %venues.category_id nil))))))
    (testing "Show me category IDs for categories that have expensive restaurants"
      (is (= [[40 "Japanese"]
              [67 "Steakhouse"]]
             (mt/$ids (chain-filter/chain-filter %venues.category_id {%venues.price 4})))))
    (testing "Show me the category 40 (constraints do not support remapping)"
      (is (= [[40 "Japanese"]]
             (mt/$ids (chain-filter/chain-filter %venues.category_id {%venues.category_id 40})))))))

(deftest fk-field-to-field-remapped-chain-filter-search-test
  (with-fk-field-to-field-remapping
    (testing "Show me categories starting with s"
      (doseq [constraints [nil {}]]
        (testing (format "\nconstraints = %s" (pr-str constraints))
          (is (= [[64 "Southern"]
                  [67 "Steakhouse"]]
                 (take 3 (mt/$ids (chain-filter/chain-filter-search %venues.category_id constraints "s"))))))))
    (testing "Show me categories starting with s that have expensive restaurants"
      (is (= [[67 "Steakhouse"]]
             (mt/$ids (chain-filter/chain-filter-search %venues.category_id {%venues.price 4} "s")))))
    (testing "search for something crazy = should return empty results"
      (is (= []
             (mt/$ids (chain-filter/chain-filter-search %venues.category_id {%venues.price 4} "zzzzz")))))))

(deftest time-interval-test
  (testing "chain-filter should accept time interval strings like `past32weeks` for temporal Fields"
    (mt/$ids
      (is (= [:time-interval $checkins.date -32 :week {:include-current false}]
             (#'chain-filter/filter-clause $$checkins %checkins.date "past32weeks"))))))
