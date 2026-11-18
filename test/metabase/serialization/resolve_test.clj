(ns metabase.serialization.resolve-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.protocol.stub :as protocol.stub]
   [metabase.serialization.resolve :as resolve]))

(deftest ^:parallel resolved-value-test
  (let [found {1 "Card_1" 2 nil}]
    (is (= "Card_1" (resolve/resolved-value found :model/Card 1)))
    (testing "resolved nil is nil"
      (is (nil? (resolve/resolved-value found :model/Card 2))))
    (testing "missing input throws target-not-found error naming its model and input"
      (let [e (try (resolve/resolved-value found :model/Table 9)
                   nil
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (resolve/target-not-found? e))
        (is (=? {:model :model/Table :id 9} (ex-data e)))))))

(deftest ^:parallel walk-in-bulk-test
  (testing "resolves the inputs of each model once, with the set of all inputs the forms hold"
    (let [calls (atom [])
          walk  (fn [visit [a b]] [(visit :model/A a) (resolve/visit-some :model/B b visit)])]
      (is (= [["A1" "B2"] ["A1" nil]]
             (resolve/walk-in-bulk [[1 2] [1 nil]] walk
                                   (fn [model xs]
                                     (swap! calls conj [model xs])
                                     (into {} (map (fn [x] [x (str (name model) x)])) xs)))))
      (is (= #{[:model/A #{1}] [:model/B #{2}]} (set @calls)))))
  (testing "visitors of both walks carry walk options"
    (let [seen (atom [])]
      (resolve/walk-in-bulk [1] {:lenient? true}
                            (fn [visit x]
                              (swap! seen conj [(resolve/collecting? visit) (resolve/options visit)])
                              x)
                            (constantly {}))
      (is (= [[true {:lenient? true}] [false {:lenient? true}]] @seen)))))

(defn- recording-store
  "A store that names each Card id `Card_<id>`, records every call in `calls`, and finds no Card or User 404."
  [calls]
  (protocol.stub/stub-store
   {:calls    calls
    :fk       (fn [id model] (when-not (= id 404) (str (name model) "_" id)))
    :fk-keyed (fn [id _model _column] (when-not (= id 404) (str "user" id "@example.com")))
    :table    (fn [id] ["DB" nil (str "T" id)])
    :field    (fn [id] ["DB" nil "T" (str "F" id)])}))

(deftest ^:parallel row-refs-test
  (testing "resolves ids to references by model, leaving out missing rows but Users and Databases, which are nil"
    (let [store (recording-store (atom []))]
      (is (= {1 "Card_1" 2 "Card_2"} (resolve/row-refs store :model/Card #{1 2 404})))
      (is (= {7 "user7@example.com" 404 nil} (resolve/row-refs store :model/User #{7 404})))
      (is (= {3 ["DB" nil "T3"]} (resolve/row-refs store :model/Table #{3}))))))

(deftest ^:parallel export-in-bulk-test
  (testing "rewrites every form with one store call per model"
    (let [calls (atom [])
          walk  (fn [visit [card user]] [(visit :model/Card card) (visit :model/User user)])]
      (is (= [["Card_1" "user7@example.com"] ["Card_2" "user7@example.com"]]
             (resolve/export-in-bulk (recording-store calls) [[1 7] [2 7]] walk)))
      (is (= #{[:select-by-pks :model/Card] [:select-by-pks :model/User]} (set @calls)))
      (is (= 2 (count @calls)))))
  (testing "resolves an input the collecting walk missed because it threw before reaching it"
    (let [calls (atom [])
          walk  (fn [visit [a b]]
                  (let [x (visit :model/Card a)]
                    (when-not (string? x)
                      (throw (ex-info "needs a resolved value" {})))
                    [x (visit :model/Card b)]))]
      (is (= [["Card_1" "Card_2"] ["Card_3" "Card_4"]]
             (resolve/export-in-bulk (recording-store calls) [[1 2] [3 4]] walk)))
      (is (= 3 (count @calls)))))
  (testing "a missing target fails only the form that refers to it"
    (let [walk (fn [visit id]
                 (try (visit :model/Card id)
                      (catch clojure.lang.ExceptionInfo e (ex-message e))))]
      (is (= ["Card_1" "Card 404 was not found"]
             (resolve/export-in-bulk (recording-store (atom [])) [1 404] walk))))))
