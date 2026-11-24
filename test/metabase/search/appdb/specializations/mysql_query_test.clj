(ns metabase.search.appdb.specializations.mysql-query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.search.appdb.specialization.mysql :as mysql]))

(set! *warn-on-reflection* true)

(def ^:private options
  {:min_size 3, :max_size 8, :in-transaction? false})

(defn- term [word prefix?]
  {:tokens   [word]
   :phrase?  false
   :prefix?  prefix?
   :negated? false})

(deftest ^:parallel token-boundaries-test
  (doseq [[length prefix? scan?] [[2 false true]
                                  [3 false false]
                                  [8 false false]
                                  [9 false true]
                                  [1 true true]
                                  [2 true false]
                                  [3 true false]
                                  [7 true false]
                                  [8 true true]]]
    (testing (str "length " length ", prefix " prefix?)
      (is (= scan? (boolean (#'mysql/scan-required? (term (apply str (repeat length "a")) prefix?) options)))))))

(deftest ^:parallel regexp-fallbacks-test
  (doseq [[input opts] [[(term "revenue" false) (assoc options :in-transaction? true)]
                        [(term "e-commerce" false) options]
                        [(assoc (term "revenue" true) :phrase? true) options]]]
    (is (#'mysql/scan-required? input opts))))

(deftest ^:parallel prefix-index-fields-test
  (let [fields (#'mysql/entry-fields {:name "Orders Orders", :searchable_text "Orders", :native_query "Secret"} 8)]
    (is (= "orders orders orders" (:search_terms fields)))
    (is (= "orders orders orders secret" (:native_search_terms fields)))
    (is (= 4 (count (str/split (:prefix_terms fields) #" "))))
    (is (= #{"norders"
             "qorders"
             "qsecret"
             "sorders"}
           (set (str/split (:prefix_terms fields) #" "))))))

(deftest ^:parallel unicode-token-length-test
  (let [letter (String. (Character/toChars 0x10428))
        word   (apply str (repeat 9 letter))
        fields (#'mysql/entry-fields {:name word} 8)]
    (is (= 9 (#'mysql/character-count word)))
    (is (= (str "n" (apply str (repeat 7 letter)))
           (first (str/split (:prefix_terms fields) #" "))))
    (is (false? (boolean (#'mysql/scan-required? (term (apply str (repeat 7 letter)) true) options))))))

(deftest ^:parallel mixed-token-prefix-test
  (is (= [:and
          [:> [:match-against :search_index.search_terms "+user"] 0]
          [:> [:match-against :search_index.prefix_terms "+sidentifier*"] 0]]
         (#'mysql/term-match :search_index.search_terms
                             (assoc (term "identifier" true) :tokens ["user" "identifier"])
                             (assoc options :max_size 84)))))

(deftest ^:parallel mixed-token-size-boundaries-test
  (doseq [[tokens scan?] [[["id" "rev"] true]
                          [["abcdefgh" "rev"] false]
                          [["abc" "id"] false]
                          [["abc" "a"] true]]]
    (is (= scan? (boolean (#'mysql/scan-required? (assoc (term "" true) :tokens tokens) options))))))

(deftest ^:parallel wordless-terms-test
  (testing "terms without words are dropped, and the last remaining term is the prefix"
    (is (= [[{:tokens ["profit"], :phrase? false, :negated? false, :prefix? false}
             {:tokens ["loss"], :phrase? false, :negated? false, :prefix? true}]]
           (#'mysql/query-terms "profit & loss")))
    (is (= [[{:tokens ["revenue"], :phrase? false, :negated? false, :prefix? true}]]
           (#'mysql/query-terms "revenue -")))
    (is (= [] (#'mysql/query-terms "-_")))
    (is (= [] (#'mysql/query-terms "& or \"&\"")))))

(deftest ^:parallel combining-marks-test
  (testing "vowel signs and the virama stay inside a Devanagari word"
    (is (= ["मासिक" "हिन्दी"] (#'mysql/words "मासिक हिन्दी")))
    (is (= #{"nमासिक" "nहिन्दी" "sमासिक" "sहिन्दी" "qमासिक" "qहिन्दी"}
           (set (str/split (:prefix_terms (#'mysql/entry-fields {:name "मासिक हिन्दी"} 84)) #" "))))))
