(ns metabase.dashboards.replacement-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.replacement :as dashboards.replacement]))

(set! *warn-on-reflection* true)

(defn- dashboard
  "A hydrated dashboard whose parameter takes its values from the card with `card-id`, with `dashcards`."
  [card-id dashcards]
  {:id                    1
   :parameters            [{:id                   "p"
                            :type                 :category
                            :values_source_type   :card
                            :values_source_config {:card_id card-id}}]
   :replacement/dashcards dashcards
   :replacement/cards     {}})

(def ^:private unmapped-dashcard
  "A dashcard without parameter mappings or click behaviors."
  {:id 31, :parameter_mappings [], :visualization_settings {}})

(deftest ^:parallel upgrade-field-refs-test
  (testing "dashboard whose parameters and dashcards have nothing to upgrade writes nothing"
    (is (= [] (dashboards.replacement/upgrade-field-refs (dashboard 2 [unmapped-dashcard]))))))

(deftest ^:parallel swap-source-test
  (testing "parameter that takes its values from old card takes them from new card"
    (is (=? [[:model/Dashboard 1 {:parameters [{:id "p" :values_source_config {:card_id 3}}]}]]
            (dashboards.replacement/swap-source (dashboard 2 [unmapped-dashcard]) [:card 2] [:card 3]))))
  (testing "dashboard that does not use old card writes nothing"
    (is (= [] (dashboards.replacement/swap-source (dashboard 4 [unmapped-dashcard]) [:card 2] [:card 3]))))
  (testing "table swap leaves card parameter sources alone"
    (is (= [] (dashboards.replacement/swap-source (dashboard 2 []) [:table 2] [:table 3])))))
