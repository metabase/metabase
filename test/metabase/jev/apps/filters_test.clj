(ns metabase.jev.apps.filters-test
  (:require
   [clojure.test :refer :all]
   [metabase.jev.apps.filters :as filters])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private today (LocalDate/of 2026 9 23))

(deftest date-options-test
  (let [opts   (filters/date-options today "since 2026-03-01")
        values (set (map :value opts))]
    (testing "relative options use Metabase's parameter value strings"
      (is (every? values ["today" "thisquarter" "thisyear" "past30days" "past1quarters" "past1years"])))
    (testing "calendar years, quarters and months are computed from today"
      (is (every? values ["2025-01-01~2025-12-31" "Q3-2026" "Q1-2025" "2026-09" "2025-10"]))
      (is (not (values "Q4-2026")) "future quarters are not offered"))
    (testing "last quarter is the previous complete calendar quarter"
      (is (= [(LocalDate/of 2026 4 1) (LocalDate/of 2026 6 30)]
             ((juxt :start :end) (first (filter #(= "past1quarters" (:value %)) opts))))))
    (testing "dates typed in the text become single-day / open-ended options"
      (is (every? values ["2026-03-01" "2026-03-01~" "~2026-03-01"])))))

(deftest date-candidates-by-param-type-test
  (let [cands (fn [t] (map :value (filters/param-candidates {:type t} "x" today nil)))]
    (is (every? #(re-matches #"Q[1-4]-\d{4}" %) (cands :date/quarter-year)))
    (is (every? #(re-matches #"\d{4}-\d{2}" %) (cands :date/month-year)))
    (is (every? #(re-matches #"\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}" %) (cands :date/range)))
    (is (some #{"thisquarter"} (cands :date/relative)))))

(deftest value-candidates-test
  (testing "small lists are passed through in order"
    (is (= ["Doohickey" "Gadget"]
           (map :value (filters/value-candidates "gadgets" [["Doohickey"] ["Gadget"]])))))
  (testing "large lists are pre-filtered by lexical overlap, then filled up to the cap"
    (let [values (concat (for [i (range 100)] [(str "Vendor " i)]) [["Pouros and Sons"] [42 "Americo Sipes"]])
          cands  (filters/value-candidates "widgets from pouros and americo" values)]
      (is (= 60 (count cands)))
      (is (some #(= "Pouros and Sons" (:value %)) cands))
      (is (some #(and (= 42 (:value %)) (= "Americo Sipes" (:label %))) cands) "remapped values keep the raw value"))))

(deftest temporal-unit-and-number-candidates-test
  (is (= ["day" "week" "month" "quarter" "year"]
         (map :value (filters/param-candidates {:type :temporal-unit} "x" today nil))))
  (is (= ["month" "year"]
         (map :value (filters/param-candidates {:type :temporal-unit :temporal_units [:month :year]} "x" today nil))))
  (is (= [[1000] [25]] (map :value (filters/param-candidates {:type :number/>=} "over 1,000 or 25" today nil))))
  (is (= [[10 20]] (map :value (filters/param-candidates {:type :number/between} "between 20 and 10" today nil))))
  (is (nil? (filters/param-candidates {:type :number/=} "no numbers here" today nil)))
  (is (nil? (filters/param-candidates {:type :boolean/=} "x" today nil)) "unsupported types are skipped"))

(defn- answer [choice probs]
  {:type "choice" :choice choice :confidence (get probs (keyword choice)) :probabilities probs})

(deftest interpret-answer-test
  (let [param {:id "p" :name "Category" :type :string/=}
        cands [{:value "Gizmo" :label "Gizmo"} {:value "Gadget" :label "Gadget"} {:value "Widget" :label "Widget"}]]
    (testing "none is dropped"
      (is (nil? (filters/interpret-answer param cands (answer "none" {:none 0.9 :o0 0.1})))))
    (testing "multi-select takes other options with substantial probability"
      (is (= {:value ["Gizmo" "Gadget"] :label "Gizmo, Gadget"}
             (select-keys (filters/interpret-answer param cands (answer "o0" {:o0 0.5 :o1 0.42 :o2 0.05 :none 0.03}))
                          [:value :label]))))
    (testing "single-select parameters get exactly one value"
      (is (= ["Gizmo"] (:value (filters/interpret-answer (assoc param :isMultiSelect false) cands
                                                         (answer "o0" {:o0 0.5 :o1 0.42}))))))
    (testing "a narrowly-losing real option is kept as a low-confidence suggestion"
      (let [r (filters/interpret-answer param cands (answer "none" {:none 0.6 :o2 0.35}))]
        (is (= ["Widget"] (:value r)))
        (is (< (:confidence r) 0.5))))
    (testing "invented option keys are ignored"
      (is (nil? (filters/interpret-answer param cands (answer "o99" {:o99 1.0})))))))

(deftest suggest-test
  (let [dashboard {:name "Sales"
                   :parameters [{:id "d" :name "Date Range" :type :date/all-options}
                                {:id "u" :name "Grouping" :type :temporal-unit}
                                {:id "c" :name "Category" :type :string/=}
                                {:id "b" :name "Flag" :type :boolean/=}]}
        asked     (atom nil)
        ask-fn    (fn [state questions]
                    (reset! asked [state questions])
                    (let [date-key (some (fn [[k desc]] (when (re-find #"^Last quarter" desc) k))
                                         (get-in questions [:pd :criteria]))]
                      {:ok     true
                       :usage  {:input_tokens 1}
                       :answers {:pd {:type "choice" :choice (name date-key) :probabilities {date-key 0.9}}
                                 :pu {:type "choice" :choice "o1" :probabilities {:o1 0.95}}
                                 :pc {:type "choice" :choice "none" :probabilities {:none 0.97}}}}))
        result    (filters/suggest dashboard "last quarter by week"
                                   {:today today :ask-fn ask-fn :values-fn (constantly [["Gizmo"] ["Widget"]])})]
    (is (= "ok" (:status result)))
    (is (= #{:pd :pu :pc} (set (keys (second @asked)))) "one question per supported parameter, in one call")
    (is (= "last quarter by week" (:text (first @asked))))
    (is (= [{:parameter_id "d" :value "past1quarters"} {:parameter_id "u" :value "week"}]
           (map #(select-keys % [:parameter_id :value]) (:filters result)))))
  (testing "a Jev failure is data"
    (is (= "unavailable"
           (:status (filters/suggest {:parameters [{:id "u" :name "G" :type :temporal-unit}]} "by week"
                                     {:today today :ask-fn (constantly {:ok false :error "boom"})}))))))

(deftest alternatives-test
  (testing "the pick comes first, then single options by probability; equivalent dates collapse"
    (let [param {:id "d" :name "Date Range" :type :date/all-options}
          cands (vec (#'filters/date-candidates :date/all-options today ""))
          key-of (fn [value] (keyword (str "o" (first (keep-indexed #(when (= value (:value %2)) %1) cands)))))
          r     (filters/interpret-answer param cands
                                          (answer (name (key-of "past1quarters")) {(key-of "past1quarters") 0.7
                                                                                   (key-of "thisquarter")   0.2
                                                                                   (key-of "past90days")    0.05
                                                                                   :none                    0.05}))]
      (is (= "past1quarters" (:value r)))
      (is (= ["past1quarters" "thisquarter" "past90days"] (map :value (:alternatives r)))))))

(deftest mention-checks-test
  (let [params    [{:id "c" :name "Category" :type :string/=}]
        values    (constantly [["Gizmo"] ["Gadget"] ["Widget"]])
        ask-fn    (fn [_state questions]
                    {:ok      true
                     :answers (into {:pc {:type "choice" :choice "none" :probabilities {:none 0.6 :o1 0.2 :o2 0.2}}}
                                    (for [k (keys questions) :when (re-find #"_m" (name k))]
                                      [k {:type "noul" :noul 0.9}]))})
        asked     (atom nil)
        result    (filters/suggest {:parameters params} "widgets and gadgets"
                                   {:today today :values-fn values
                                    :ask-fn (fn [s q] (reset! asked q) (ask-fn s q))})]
    (testing "every literally-named value of a multi-select filter gets its own yes/no check"
      (is (= #{:pc :pc_m0 :pc_m1} (set (keys @asked)))))
    (testing "confirmed values are applied even when the single choice split its probability"
      (is (= #{"Gadget" "Widget"} (set (-> result :filters first :value))))
      (is (= 0.9 (-> result :filters first :confidence))))))

(deftest stopword-labels-test
  (testing "\"or\" in the text is not evidence for Oregon"
    (is (zero? (filters/match-score "organic or google" "OR")))
    (is (pos? (filters/match-score "orders in oregon" "Oregon")))))

(deftest usable-columns-test
  (let [fields {1 {:id 1 :has_field_values :list}
                2 {:id 2 :has_field_values :search}
                3 {:id 3 :has_field_values :list :semantic_type :type/FK}
                4 {:id 4 :has_field_values :auto-list}}
        cols   [{:key "a" :field_id 1 :kind "values"} {:key "b" :field_id 2 :kind "values"}
                {:key "c" :field_id 3 :kind "values"} {:key "d" :field_id 4 :kind "values"}
                {:key "e" :field_id nil :kind "date"} {:key "f" :field_id 99 :kind "values"}]]
    (is (= ["a" "d" "e"] (map :key (filters/usable-columns cols fields)))
        "listable value columns, generated-option columns; no FKs, no unlisted or unreadable fields")))

(deftest narrow-slots-test
  (let [cols   (for [[k kind] [["a" "number"] ["b" "date"] ["c" "values"] ["d" "values"] ["e" "number"]]]
                 {:key k :display_name (str "Col " k) :kind kind})
        probs  {"a" 0.1 "b" 0.8 "c" 0.7 "d" 0.2 "e" 0.05}
        ask-fn (fn [state questions]
                 ;; questions are c0..cN over the prior-sorted columns in state
                 (let [ordered (map #(re-find #"Col (\w)" %) (:columns state))]
                   {:ok      true
                    :answers (into {} (map-indexed (fn [i [_ k]] [(keyword (str "c" i)) {:type "noul" :noul (probs k)}])
                                                   ordered))
                    :asked   (count questions)}))
        result (filters/narrow-slots "Orders" cols {:ask-fn ask-fn})]
    (is (= "ok" (:status result)))
    (is (= ["b" "c" "d"] (map :key (:slots result)))
        "most likely first; below the floor only to keep a minimum of rows")))
