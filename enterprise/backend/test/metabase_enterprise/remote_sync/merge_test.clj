(ns metabase-enterprise.remote-sync.merge-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]))

(defn- doc
  "A document with the YAML content `yaml`, named `name`."
  [name yaml]
  {:path (str name ".yaml") :entity {:name name} :yaml yaml :resources {}})

(def ^:private a [:model/Card "a"])
(def ^:private b [:model/Card "b"])

(deftest merge-keeps-one-sided-changes-test
  (let [base {a (doc "A" "1") b (doc "B" "1")}]
    (testing "our change is kept when they did not change the entity"
      (is (= {a (doc "A" "2") b (doc "B" "1")}
             (:merged (remote-sync.merge/merge-documents base {a (doc "A" "2") b (doc "B" "1")} base)))))
    (testing "their change is taken when we did not change the entity, and counted"
      (let [result (remote-sync.merge/merge-documents base base {a (doc "A" "1") b (doc "B" "2")})]
        (is (= {a (doc "A" "1") b (doc "B" "2")} (:merged result)))
        (is (= {:added 0 :updated 1 :removed 0} (:summary result)))))
    (testing "an entity they removed is removed when we did not change it"
      (let [result (remote-sync.merge/merge-documents base base {a (doc "A" "1")})]
        (is (= {a (doc "A" "1")} (:merged result)))
        (is (= {:added 0 :updated 0 :removed 1} (:summary result)))))
    (testing "an entity we removed stays removed when they did not change it"
      (is (= {b (doc "B" "1")} (:merged (remote-sync.merge/merge-documents base {b (doc "B" "1")} base)))))))

(deftest merge-conflicts-test
  (let [base {a (doc "A" "1")}]
    (testing "both sides changing an entity differently is a conflict"
      (let [result (remote-sync.merge/merge-documents base {a (doc "A" "2")} {a (doc "A" "3")})]
        (is (= ["A"] (:conflicts result)))
        (is (not (contains? (:merged result) a)))))
    (testing "both sides changing an entity the same way is not a conflict"
      (let [result (remote-sync.merge/merge-documents base {a (doc "A" "2")} {a (doc "A" "2")})]
        (is (empty? (:conflicts result)))
        (is (= {a (doc "A" "2")} (:merged result)))))
    (testing "we change an entity they removed: a conflict"
      (is (= ["A"] (:conflicts (remote-sync.merge/merge-documents base {a (doc "A" "2")} {})))))))

(deftest merge-casualties-test
  (testing "their changes that taking ours would discard are listed"
    (let [base   {a (doc "A" "1") b (doc "B" "1")}
          result (remote-sync.merge/merge-documents base {a (doc "A" "1")} {a (doc "A" "2") b (doc "B" "2")})]
      (is (= {:deleted ["B"] :overwritten ["A"]} (:casualties result))))))
