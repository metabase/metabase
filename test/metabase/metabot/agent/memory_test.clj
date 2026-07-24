(ns metabase.metabot.agent.memory-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(deftest ^:parallel initialize-test
  (testing "seeds the working state and starts an empty turn-state"
    (let [messages [{:role :user :content "Hello"}]
          state {:queries {"q1" {:id "q1"}} :charts {}}
          mem (memory/initialize messages state)]
      (is (= messages (:input-messages mem)))
      (is (= state (memory/get-state mem)))
      (is (= {} (:turn-state mem)))
      (is (= [] (:steps-taken mem)))))
  (testing "defaults the working state when nil"
    (let [mem (memory/initialize [{:role :user :content "Hello"}] nil)]
      (is (= {:queries {} :charts {} :todos [] :transforms {} :link-registry {}}
             (memory/get-state mem))))))

(deftest ^:parallel initialize-normalizes-state-registry-keys-test
  (let [query          {:database 1 :nested/value "preserved"}
        chart          {:chart_id              "c1"
                        :queries               [query]
                        :visualization_settings {:chart_type :bar}}
        transform      {:name "Transform"}
        chart-config   {:display_type "bar"}
        current-query  {:database 2}
        mem            (memory/initialize
                        []
                        {:queries       {:q1 query, :current current-query, "current" {:database 3}}
                         :charts        {:c1 chart}
                         :transforms    {:t1 transform}
                         :chart-configs {:cc1 chart-config}
                         :link-registry {(keyword "question/123") "metabase://question/123"}})
        state          (memory/get-state mem)]
    (testing "keywordized entity IDs are restored to strings without changing nested payload keys"
      (is (= query (memory/find-query mem "q1")))
      (is (= chart (memory/find-chart mem "c1")))
      (is (= transform (memory/find-transform mem "t1")))
      (is (= {"cc1" chart-config} (:chart-configs state)))
      (is (= "preserved" (get-in state [:queries "q1" :nested/value]))))
    (testing "the string-keyed current-context entry wins if both key representations are present"
      (is (= {:database 3} (memory/find-query mem "current"))))
    (testing "link-registry path components retain their namespace"
      (is (= {"question/123" "metabase://question/123"}
             (:link-registry state))))
    (testing "shared tool state and link resolution use the normalized string keys"
      (binding [shared/*memory-atom* (atom mem)]
        (is (= query (get (shared/current-queries-state) "q1")))
        (is (= chart (get (shared/current-charts-state) "c1"))))
      (is (str/starts-with? (links/resolve-metabase-uri "metabase://query/q1"
                                                        (:queries state)
                                                        (:charts state))
                            "/question#"))
      (is (str/starts-with? (links/resolve-metabase-uri "metabase://chart/c1"
                                                        (:queries state)
                                                        (:charts state))
                            "/question#")))))

(deftest ^:parallel initialize-canonicalizes-round-tripped-queries-test
  (testing "a pMBQL query degraded by a JSON round-trip is re-canonicalized on rehydration"
    (let [mp      (mt/metadata-provider)
          query   (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          degrade #(json/decode (json/encode %) true)
          state   {:queries    {"q1" (degrade query)}
                   :charts     {"c1" {:queries [(degrade query)]}}
                   :transforms {"1" {:source {:query (degrade query)}}}}
          mem     (memory/initialize [] state)]
      (is (= :mbql/query (:lib/type (memory/find-query mem "q1"))))
      (is (= :mbql/query (:lib/type (first (:queries (memory/find-chart mem "c1"))))))
      (is (= :mbql/query (get-in (memory/find-transform mem "1")
                                 [:source :query :lib/type]))))))

(deftest ^:parallel add-step-test
  (testing "adds step to memory"
    (let [mem (memory/initialize [] {})
          parts [{:type :text :text "Response"}
                 {:type :tool-input :function "search" :arguments {:query "test"}}]
          mem' (memory/add-step mem parts)]
      (is (= 1 (count (:steps-taken mem'))))
      (is (= parts (-> mem' :steps-taken first :parts)))))
  (testing "adds multiple steps"
    (let [mem (memory/initialize [] {})
          parts1 [{:type :tool-input :function "search"}]
          parts2 [{:type :text :text "Response"}]
          mem' (-> mem
                   (memory/add-step parts1)
                   (memory/add-step parts2))]
      (is (= 2 (count (:steps-taken mem'))))
      (is (= parts1 (-> mem' :steps-taken first :parts)))
      (is (= parts2 (-> mem' :steps-taken second :parts))))))

(deftest ^:parallel writers-update-state-and-turn-delta-test
  (testing "a writer applies to the working state and records the same into the turn delta"
    (let [mem  (memory/initialize [] {:queries {"q1" {:id "q1"}}})
          mem' (-> mem
                   (memory/set-query "q2" {:id "q2"})
                   (memory/set-todos [{:id "b"}]))]
      (testing "working state carries the seeded baseline plus this turn's writes"
        (is (= {:queries {"q1" {:id "q1"} "q2" {:id "q2"}} :todos [{:id "b"}]}
               (memory/get-state mem'))))
      (testing "turn delta carries only this turn's writes — not the seeded baseline"
        (is (= {:queries {"q2" {:id "q2"}} :todos [{:id "b"}]}
               (memory/turn-state mem'))))))
  (testing "turn-state is nil until this turn writes something"
    (let [mem (memory/initialize [] {:queries {"q1" {:id "q1"}}})]
      (is (nil? (memory/turn-state mem))))))

(deftest ^:parallel set-link-registry-test
  (testing "an empty or unchanged registry is not written into the turn delta"
    (let [without-registry (memory/initialize [] {})
          registry        {"/model/1" "metabase://model/1"}
          with-registry    (memory/initialize [] {:link-registry registry})]
      (is (= without-registry (memory/set-link-registry without-registry {})))
      (is (= with-registry (memory/set-link-registry with-registry registry)))
      (is (nil? (memory/turn-state (memory/set-link-registry without-registry {}))))
      (is (nil? (memory/turn-state (memory/set-link-registry with-registry registry))))))
  (testing "a newly resolved link updates live state and the turn delta"
    (let [mem      (memory/initialize [] {})
          registry (atom {})
          _        (links/resolve-links "[Model](metabase://model/1)" {} {} registry)
          mem'     (memory/set-link-registry mem @registry)]
      (is (= {"/model/1" "metabase://model/1"}
             (get-in mem' [:state :link-registry])))
      (is (= {:link-registry {"/model/1" "metabase://model/1"}}
             (memory/turn-state mem'))))))

(deftest ^:parallel merge-states-test
  (testing "map entries merge; scalar/vector entries take the later value"
    (is (= {:queries {:q1 1 :q2 2} :todos [{:id "b"}]}
           (memory/merge-states {:queries {:q1 1} :todos [{:id "a"}]}
                                {:queries {:q2 2} :todos [{:id "b"}]})))))

(deftest ^:parallel get-steps-test
  (testing "retrieves all steps"
    (let [parts1 [{:type :tool-input}]
          parts2 [{:type :text}]
          mem (-> (memory/initialize [] {})
                  (memory/add-step parts1)
                  (memory/add-step parts2))]
      (is (= 2 (count (memory/get-steps mem))))
      (is (= parts1 (-> mem memory/get-steps first :parts)))
      (is (= parts2 (-> mem memory/get-steps second :parts))))))

(deftest ^:parallel get-input-messages-test
  (testing "retrieves input messages"
    (let [messages [{:role :user :content "Hello"}
                    {:role :assistant :content "Hi"}]
          mem (memory/initialize messages {})]
      (is (= messages (memory/get-input-messages mem))))))

(deftest ^:parallel iteration-count-test
  (testing "counts number of steps"
    (let [mem (-> (memory/initialize [] {})
                  (memory/add-step [{:type :tool-input}])
                  (memory/add-step [{:type :text}])
                  (memory/add-step [{:type :tool-input}]))]
      (is (= 3 (memory/iteration-count mem)))))
  (testing "returns 0 for new memory"
    (let [mem (memory/initialize [] {})]
      (is (= 0 (memory/iteration-count mem))))))
