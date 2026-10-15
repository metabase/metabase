(ns metabase-enterprise.library-branching.engine.validate-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.test-util :as engine.tu]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

(def ^:private lib (engine.tu/eid "lib"))
(def ^:private sub (engine.tu/eid "sub"))
(def ^:private metric (engine.tu/eid "metric"))
(def ^:private snippet (engine.tu/eid "snippet"))
(def ^:private gone (engine.tu/eid "gone"))
(def ^:private orders ["Sample Database" "PUBLIC" "ORDERS"])

(def ^:private library
  {lib     (engine.tu/item :collection "Library" nil)
   sub     (engine.tu/item :collection "Metrics" lib)
   metric  (engine.tu/item :metric "Revenue" sub #{[:snippet snippet] [:source-table [:env orders]] [:table orders]})
   snippet (engine.tu/item :snippet "Filter" lib)
   orders  (engine.tu/item :published-table "Orders" lib)})

(deftest ^:parallel well-formed-test
  (testing "a well-formed snapshot has no finding"
    (is (= [] (validate/validate library)))
    (is (= [] (validate/validate {})))
    (is (= [] (validate/validate library {:roots #{lib}}))))
  (testing "an item that refers to itself is well formed"
    (is (= [] (validate/validate (assoc-in library [metric :refs] #{[:card metric]}))))))

(deftest ^:parallel place-inside-test
  (testing "a place that is not in the snapshot is a finding"
    (is (= [{:rule :place-inside :id sub :place gone}]
           (validate/validate (assoc-in library [sub :place] gone)))))
  (testing "the items under an item with a missing place give no finding of their own"
    (is (= [{:rule :place-inside :id lib :place gone}]
           (validate/validate (assoc-in library [lib :place] gone))))))

(deftest ^:parallel acyclic-test
  (testing "a containment cycle is one finding that names every item on the cycle"
    (is (= [{:rule :acyclic :ids #{lib sub}}]
           (validate/validate (assoc-in library [lib :place] sub)))))
  (testing "an item that contains itself is a cycle"
    (is (= [{:rule :acyclic :ids #{lib}}]
           (validate/validate (assoc-in library [lib :place] lib))))
    (is (= #{{:rule :acyclic :ids #{snippet}} {:rule :kind-fits :id snippet :place snippet}}
           (set (validate/validate (assoc-in library [snippet :place] snippet))))))
  (testing "an item under a cycle is not on it"
    (is (= [{:rule :acyclic :ids #{sub}}]
           (validate/validate (assoc-in library [sub :place] sub)))))
  (testing "two cycles are two findings"
    (is (= #{{:rule :acyclic :ids #{lib}} {:rule :acyclic :ids #{sub}}}
           (set (validate/validate (-> library (assoc-in [lib :place] lib) (assoc-in [sub :place] sub))))))))

(deftest ^:parallel kind-fits-test
  (testing "an item in a container whose kind cannot contain its kind is a finding"
    (is (= [{:rule :kind-fits :id snippet :place metric}]
           (validate/validate (assoc-in library [snippet :place] metric))))
    (is (= [{:rule :kind-fits :id sub :place orders}]
           (validate/validate (assoc-in library [sub :place] orders)))))
  (testing "`:may-contain` replaces the containment rules"
    (is (= [{:rule :kind-fits :id metric :place sub}]
           (validate/validate library {:may-contain {:collection #{:collection :snippet :published-table}}})))))

(deftest ^:parallel refs-closed-test
  (testing "a reference to an identity that is not in the snapshot is a finding, one per reference"
    (is (= [{:rule :refs-closed :id metric :ref [:snippet snippet]}]
           (validate/validate (dissoc library snippet))))
    (is (= [{:rule :refs-closed :id metric :ref [:table orders]}]
           (validate/validate (dissoc library orders)))))
  (testing "a reference to the environment needs no item"
    (is (= [] (validate/validate (assoc-in library [metric :refs] #{[:source-table [:env ["Aviary" nil "NESTS"]]]})))))
  (testing "a table key is an identity, so a reference to it without [:env] needs the published table"
    (is (= [{:rule :refs-closed :id metric :ref [:table ["Aviary" nil "NESTS"]]}]
           (validate/validate (assoc-in library [metric :refs] #{[:table ["Aviary" nil "NESTS"]]}))))))

(deftest ^:parallel root-test
  (testing "with `:roots`, every item at the root level must be a root"
    (is (= [{:rule :root :id lib}] (validate/validate library {:roots #{}})))
    (is (= [{:rule :root :id snippet}]
           (validate/validate (assoc-in library [snippet :place] nil) {:roots #{lib}}))))
  (testing "without `:roots`, items at the root level need no check"
    (is (= [] (validate/validate (assoc-in library [snippet :place] nil))))))

(deftest ^:parallel several-findings-test
  (testing "the findings of every rule are all reported"
    (is (= #{{:rule :place-inside :id sub :place gone}
             {:rule :refs-closed :id metric :ref [:snippet snippet]}
             {:rule :kind-fits :id orders :place metric}
             {:rule :root :id lib}}
           (set (validate/validate (-> library
                                       (dissoc snippet)
                                       (assoc-in [sub :place] gone)
                                       (assoc-in [orders :place] metric))
                                   {:roots #{}}))))))

;;; ------------------------------------------------ Properties -------------------------------------------------

(defn- cycle-members
  "The items of `s` that are on a containment cycle."
  [s]
  (set (filter (fn [id]
                 (loop [at (:place (get s id)), n (count s)]
                   (cond (= at id)                                  true
                         (or (nil? at) (not (contains? s at)) (neg? n)) false
                         :else                                      (recur (:place (get s at)) (dec n)))))
               (keys s))))

(defn- finding-holds?
  "True iff finding `f` names a fault that snapshot `s` has."
  [s {:keys [rule id place ids ref]}]
  (case rule
    :place-inside (and (= place (:place (get s id))) (not (contains? s place)))
    :kind-fits    (and (= place (:place (get s id))) (contains? s place)
                       (not (contains? (get snapshot/may-contain (:kind (get s place)) #{}) (:kind (get s id)))))
    :refs-closed  (and (contains? (:refs (get s id)) ref)
                       (not (lb.tu/env-target? (second ref)))
                       (not (contains? s (second ref))))
    :acyclic      (and (seq ids)
                       (every? #(contains? ids (:place (get s %))) ids)
                       (every? (cycle-members s) ids))
    :root         false))

(defspec arbitrary-snapshot-findings-test 200
  (prop/for-all [s (lb.tu/arbitrary-snapshot-gen {:max-items 20})]
    (let [findings (validate/validate s)]
      (and (= (empty? findings) (lb.tu/well-formed? s))
           (every? #(finding-holds? s %) findings)
           (= (cycle-members s) (set (mapcat :ids (filter #(= :acyclic (:rule %)) findings))))
           (= (count findings) (count (set findings)))))))

(defspec well-formed-snapshot-no-findings-test 100
  (prop/for-all [s (lb.tu/well-formed-snapshot-gen {:max-items 30})]
    (= [] (validate/validate s))))

(defspec roots-test 100
  (prop/for-all [s (lb.tu/well-formed-snapshot-gen {:max-items 20})]
    (let [top (set (filter #(nil? (:place (get s %))) (keys s)))]
      (and (= [] (validate/validate s {:roots top}))
           (= (into #{} (map (fn [id] {:rule :root :id id})) top)
              (set (validate/validate s {:roots #{}})))))))

(deftest ^:parallel validate-timing-test
  (testing "an arbitrary snapshot of 5,000 items validates in under two seconds"
    (let [s     (gen/generate (lb.tu/arbitrary-snapshot-gen {:max-items 5000}) 5000 7)
          start (System/nanoTime)
          r     (validate/validate s)
          ms    (/ (- (System/nanoTime) start) 1e6)]
      (is (seq r))
      (is (< ms 2000) (str "took " ms " ms")))))

(def mutations
  "Each mutation removes one structural rule of validate."
  [{:name   :no-place-rule
    :doc    "A place that is not in the snapshot is no finding."
    :target `validate/validate
    :edits  [[:remove '(place-findings s)]]}
   {:name   :no-cycle-rule
    :doc    "A containment cycle is no finding."
    :target `validate/validate
    :edits  [[:remove '(cycle-findings s)]]}
   {:name   :no-kind-rule
    :doc    "A kind that its container cannot contain is no finding."
    :target `validate/validate
    :edits  [[:remove '(kind-findings s may-contain)]]}
   {:name   :no-ref-rule
    :doc    "A dangling reference is no finding."
    :target `validate/validate
    :edits  [[:remove '(ref-findings s)]]}
   {:name   :no-root-rule
    :doc    "An item at the root level that is not a root is no finding."
    :target `validate/validate
    :edits  [[:remove '(root-findings s roots)]]}
   {:name   :env-by-shape
    :doc    "Every vector target counts as the environment, so a reference to a missing published table closes."
    :target `validate/closed?
    :edits  [[:replace '(env-target? target) '(vector? target)]]}])

(deftest validate-mutations-test
  (mut/check mutations {:tests [#'well-formed-test #'place-inside-test #'acyclic-test #'kind-fits-test
                                #'refs-closed-test #'root-test #'several-findings-test
                                #'arbitrary-snapshot-findings-test #'roots-test]}))
