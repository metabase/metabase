(ns metabase.jev.apps.tables-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.api.common :as api]
   [metabase.jev.client :as jev]
   [metabase.jev.apps.tables :as tables]
   [toucan2.core :as t2]))

(deftest preserve-keys-test
  (doseq [semantic-type [:type/PK :type/FK]]
    (let [captured (atom nil)]
      (with-redefs [jev/ask (fn [state questions]
                              (reset! captured {:state state :questions questions})
                              {:ok true :usage {:input_tokens 100 :output_tokens 20}
                               :answers {:semantic_type {:choice (name semantic-type) :confidence 1}
                                         :sensitivity {:choice "PUBLIC" :confidence 1}}})]
        (let [r (#'tables/suggest-field {:id 1 :name "nationality_id" :base_type :type/Integer
                                         :semantic_type semantic-type :fk_target_field_id 2} ["1"])]
          (is (= #{:none (keyword (name semantic-type))}
                 (set (keys (get-in @captured [:questions :semantic_type :criteria])))))
          (is (= semantic-type (:suggested r)))
          (is (= semantic-type (get-in @captured [:state :current_semantic_type])))
          (is (= {:input_tokens 100 :output_tokens 20} (:usage r))))))))

(deftest table-usage-aggregation-test
  (with-redefs [api/read-check (fn [& _] {:id 1 :name "fixture"})
                t2/select (fn [& _] [{:id 1 :name "a" :base_type :type/Integer}
                                     {:id 2 :name "b" :base_type :type/Integer}
                                     {:id 3 :name "failed" :base_type :type/Integer}])
                tables/column-samples (fn [& _] nil)
                jev/key-present? (constantly true)
                jev/ask (fn [state _]
                          (if (= "failed" (:column_name state))
                            {:ok false :error "timeout"}
                            {:ok true :usage {:input_tokens 100 :output_tokens 20}
                             :answers {:semantic_type {:choice "none" :confidence 1}
                                       :sensitivity {:choice "PUBLIC" :confidence 1}}}))]
    (let [r (tables/table-suggestions 1)]
      (is (= {:input_tokens 200 :output_tokens 40} (:usage r)))
      (is (= 3 (:call_count r)))
      (is (= 1 (:unreported_calls r)))
      (is (number? (:elapsed_ms r))))))
