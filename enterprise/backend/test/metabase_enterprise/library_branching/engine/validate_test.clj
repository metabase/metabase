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

(def ^:private filter-2 (engine.tu/eid "filter2"))
(def ^:private filter-3 (engine.tu/eid "filter3"))
(def ^:private metric-2 (engine.tu/eid "metric2"))

(def ^:private snippets-root "snippetssnippetssnipp")
(def ^:private glossary-root "glossaryglossarygloss")
(def ^:private transforms-root "transformstransformst")
(def ^:private folder (engine.tu/eid "folder"))
(def ^:private base (engine.tu/eid "base"))
(def ^:private finance (engine.tu/eid "finance"))
(def ^:private term (engine.tu/eid "term"))

(def ^:private with-areas
  "The Library, and items at the top level of the Snippets, Transforms and Glossary areas."
  (assoc library
         folder  (assoc-in (engine.tu/item :collection "Filters" snippets-root) [:attrs :namespace] "snippets")
         base    (engine.tu/item :snippet "Base" snippets-root)
         finance (assoc-in (engine.tu/item :collection "Finance" transforms-root) [:attrs :namespace] "transforms")
         term    (engine.tu/item :glossary-term "Churn" glossary-root)))

(deftest ^:parallel area-root-test
  (testing "the area roots are the five fixed identities"
    (is (= #{"transformstransformst" "snippetssnippetssnipp" "dataactionsdataaction" "dataappsdataappsdatap"
             "glossaryglossarygloss"}
           (set (keys snapshot/area-roots)))))
  (testing "a place that names an area root is inside, with no item of that identity"
    (is (= [] (validate/validate with-areas)))
    (is (= [] (validate/validate with-areas {:roots #{lib}}))))
  (testing "a place that names no item and no area root is a finding"
    (is (= [{:rule :place-inside :id base :place gone}]
           (validate/validate (assoc-in with-areas [base :place] gone)))))
  (testing "without the area roots, a place that names one is a finding"
    (is (= #{{:rule :place-inside :id folder :place snippets-root}
             {:rule :place-inside :id base :place snippets-root}
             {:rule :place-inside :id finance :place transforms-root}
             {:rule :place-inside :id term :place glossary-root}}
           (set (validate/validate with-areas {:areas {}})))))
  (testing "an area root holds only the kinds of its area"
    (is (= [{:rule :kind-fits :id term :place snippets-root}]
           (validate/validate (assoc-in with-areas [term :place] snippets-root))))
    (is (= [{:rule :kind-fits :id metric :place glossary-root}]
           (validate/validate (assoc-in with-areas [metric :place] glossary-root)))))
  (testing "a collection at an area root has the namespace of the area"
    (is (= [{:rule :namespace :id folder :place snippets-root}]
           (validate/validate (assoc-in with-areas [folder :attrs :namespace] "transforms"))))
    (is (= [{:rule :namespace :id finance :place transforms-root}]
           (validate/validate (update-in with-areas [finance :attrs] dissoc :namespace)))))
  (testing "an item with the identity of an area root is a finding; the items at that place are in the item"
    (is (= #{{:rule :area-root :id snippets-root} {:rule :namespace :id folder :place snippets-root}}
           (set (validate/validate (assoc with-areas snippets-root (engine.tu/item :collection "Fake" lib))))))))

(deftest ^:parallel unique-key-test
  (testing "two snippets with one name are one finding that names both, with the kind and the key"
    (is (= [{:rule :unique-key :kind :snippet :key "Filter" :ids #{snippet filter-2}}]
           (validate/validate (assoc library filter-2 (engine.tu/item :snippet "Filter" sub))))))
  (testing "three snippets with one name are one finding"
    (is (= [{:rule :unique-key :kind :snippet :key "Filter" :ids #{snippet filter-2 filter-3}}]
           (validate/validate (assoc library
                                     filter-2 (engine.tu/item :snippet "Filter" sub)
                                     filter-3 (engine.tu/item :snippet "Filter" lib))))))
  (testing "names that differ only in case, accents or compatibility forms are one key, as on MySQL and MariaDB"
    (doseq [other ["filter" "FILTER" "Fïlter" "\uFB01lter" "\uFF26\uFF49\uFF4C\uFF54\uFF45\uFF52"]]
      (testing (pr-str other)
        ;; filter-2 has the lesser identity, so the finding gives its name.
        (is (= [{:rule :unique-key :kind :snippet :key other :ids #{snippet filter-2}}]
               (validate/validate (assoc library filter-2 (engine.tu/item :snippet other lib))))))))
  (testing "names with another letter, or more letters, are two keys"
    (doseq [other ["F\u0131lter" "Filter_1" "Filtre" "Ffilter"]]
      (testing (pr-str other)
        (is (= [] (validate/validate (assoc library filter-2 (engine.tu/item :snippet other lib))))))))
  (testing "items of a kind with no unique key can share a name"
    (is (= [] (validate/validate (assoc library metric-2 (engine.tu/item :metric "Revenue" sub))))))
  (testing "`:unique-keys` replaces the table; an item whose key is nil has none"
    (let [s (assoc library
                   metric   (assoc-in (get library metric) [:attrs :path] "a.py")
                   metric-2 (assoc-in (engine.tu/item :metric "Count" sub) [:attrs :path] "a.py")
                   filter-2 (engine.tu/item :metric "Total" sub))]
      (is (= [{:rule :unique-key :kind :metric :key "a.py" :ids #{metric metric-2}}]
             (validate/validate s {:unique-keys {:metric {:path [:attrs :path]}}})))
      (testing "a key that is not a name compares as it is"
        (is (= [] (validate/validate (assoc-in s [metric-2 :attrs :path] "A.py")
                                     {:unique-keys {:metric {:path [:attrs :path]}}}))))
      (is (= [] (validate/validate (assoc library filter-2 (engine.tu/item :snippet "Filter" sub))
                                   {:unique-keys {}}))))))

(deftest ^:parallel namespace-test
  (testing "a child collection in another namespace than its parent is a finding"
    (is (= [{:rule :namespace :id sub :place lib}]
           (validate/validate (assoc-in library [sub :attrs :namespace] "snippets")))))
  (testing "a child of a collection of a namespace has that namespace"
    (let [s (-> library
                (assoc-in [lib :attrs :namespace] "snippets")
                (assoc-in [sub :attrs :namespace] "snippets"))]
      (is (= [] (validate/validate s)))
      (is (= [{:rule :namespace :id sub :place lib}]
             (validate/validate (update-in s [sub :attrs] dissoc :namespace))))))
  (testing "a collection at the root level can have any namespace"
    (is (= [] (validate/validate {lib (assoc-in (get library lib) [:attrs :namespace] "transforms")}))))
  (testing "an item that is not a collection has no namespace"
    (is (= [] (validate/validate (assoc-in library [snippet :attrs :namespace] "transforms"))))))

;;; The kinds of the action-model rule are outside `snapshot/kinds`. Validate reads only the kind, the place and the
;;; references of these items.

(def ^:private model (engine.tu/eid "model"))
(def ^:private question (engine.tu/eid "question"))
(def ^:private action (engine.tu/eid "action"))

(def ^:private with-actions
  {lib      (engine.tu/item :collection "Library" nil)
   model    (engine.tu/item :model "Orders model" lib)
   question (engine.tu/item :question "Orders" lib)
   action   (engine.tu/item :action "Mark shipped" lib #{[:model model]})})

(defn- validate-actions
  [s]
  (validate/validate s {:may-contain {:collection #{:collection :model :question :action}}}))

(deftest ^:parallel action-model-test
  (testing "an action on a model is well formed"
    (is (= [] (validate-actions with-actions))))
  (testing "an action on a question is a finding"
    (is (= [{:rule :ref-kind :id action :ref [:model question]}]
           (validate-actions (assoc-in with-actions [action :refs] #{[:model question]})))))
  (testing "an action with no model is well formed"
    (is (= [] (validate-actions (assoc-in with-actions [action :refs] #{})))))
  (testing "the model of an action is an item, never an environment object"
    (is (= [{:rule :ref-kind :id action :ref [:model [:env orders]]}]
           (validate-actions (assoc-in with-actions [action :refs] #{[:model [:env orders]]})))))
  (testing "a model that is not in the snapshot is a dangling reference, and no kind finding"
    (is (= [{:rule :refs-closed :id action :ref [:model model]}]
           (validate-actions (dissoc with-actions model)))))
  (testing "a reference of another role can name a question"
    (is (= [] (validate-actions (update-in with-actions [action :refs] conj [:card question])))))
  (testing "`:ref-kinds` replaces the table"
    (is (= [{:rule :ref-kind :id metric :ref [:snippet snippet]}]
           (validate/validate library {:ref-kinds {:metric {:snippet #{:metric}}}})))
    (is (= [] (validate/validate (assoc-in with-actions [action :refs] #{[:model question]})
                                 {:may-contain {:collection #{:model :question :action}} :ref-kinds {}})))))

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

(defn- key-holders
  "The identities of the items of `s` of kind `kind` that have the unique key (`snapshot/unique-key`) of key value `v`."
  [s kind v]
  (let [path (get-in snapshot/unique-keys [kind :path])
        k    (when path (snapshot/unique-key snapshot/unique-keys (assoc-in {:kind kind} path v)))]
    (set (for [[id item] s
               :when (and path (= kind (:kind item)) (= k (snapshot/unique-key snapshot/unique-keys item)))]
           id))))

(defn- finding-holds?
  "True iff finding `f` names a fault that snapshot `s` has, with the reference kinds `ref-kinds`."
  [s ref-kinds {:keys [rule id place ids ref kind key]}]
  (case rule
    :place-inside (and (= place (:place (get s id))) (not (contains? s place))
                       (not (contains? snapshot/area-roots place)))
    :kind-fits    (and (= place (:place (get s id)))
                       (not (contains? (if (contains? s place)
                                         (get snapshot/may-contain (:kind (get s place)) #{})
                                         (get-in snapshot/area-roots [place :kinds]))
                                       (:kind (get s id)))))
    :refs-closed  (and (contains? (:refs (get s id)) ref)
                       (not (lb.tu/env-target? (second ref)))
                       (not (contains? s (second ref))))
    :acyclic      (and (seq ids)
                       (every? #(contains? ids (:place (get s %))) ids)
                       (every? (cycle-members s) ids))
    :unique-key   (and (some? key) (< 1 (count ids)) (= ids (key-holders s kind key)))
    :namespace    (and (= place (:place (get s id)))
                       (= :collection (:kind (get s id)))
                       (if (contains? s place)
                         (and (= :collection (:kind (get s place)))
                              (not= (:namespace (:attrs (get s id))) (:namespace (:attrs (get s place)))))
                         (and (contains? snapshot/area-roots place)
                              (not= (:namespace (:attrs (get s id))) (get-in snapshot/area-roots [place :namespace])))))
    :ref-kind     (let [[role target] ref
                        allowed       (get-in ref-kinds [(:kind (get s id)) role])]
                    (and (contains? (:refs (get s id)) ref)
                         (some? allowed)
                         (or (lb.tu/env-target? target)
                             (and (contains? s target) (not (contains? allowed (:kind (get s target))))))))
    :root         false
    :area-root    (and (contains? s id) (contains? snapshot/area-roots id))))

(def ^:private namespaced-attrs-gen
  "Generates the `:attrs` of a collection: those of `lb.tu/attrs-gen`, with no namespace or one of two."
  (gen/fmap (fn [[attrs n]] (cond-> attrs n (assoc :namespace n)))
            (gen/tuple lb.tu/attrs-gen (gen/elements [nil "snippets" "transforms"]))))

(def ^:private arbitrary-gen
  (lb.tu/arbitrary-snapshot-gen {:max-items 20
                                 :attrs     #(if (= :collection %) namespaced-attrs-gen lb.tu/attrs-gen)}))

(defspec arbitrary-snapshot-findings-test 200
  (prop/for-all [s arbitrary-gen]
    (let [findings (validate/validate s)]
      (and (= (empty? findings) (lb.tu/well-formed? s))
           (every? #(finding-holds? s snapshot/ref-kinds %) findings)
           (= (cycle-members s) (set (mapcat :ids (filter #(= :acyclic (:rule %)) findings))))
           (= (count findings) (count (set findings)))))))

(def ^:private test-ref-kinds
  "Reference kinds over the kinds of `snapshot/kinds` and the roles of the generators."
  {:metric     {:snippet #{:snippet} :card #{:metric :published-table}}
   :collection {:card #{:metric}}})

(defspec ref-kinds-findings-test 200
  (prop/for-all [s arbitrary-gen]
    (let [findings (filterv #(= :ref-kind (:rule %)) (validate/validate s {:ref-kinds test-ref-kinds}))]
      (and (= (empty? findings) (lb.tu/ref-kinds-fit? s test-ref-kinds))
           (every? #(finding-holds? s test-ref-kinds %) findings)))))

(deftest ^:parallel arbitrary-findings-coverage-test
  (testing "the generator of the properties gives a finding of each rule"
    (let [rules (set (for [seed (range 200)
                           f    (validate/validate (gen/generate arbitrary-gen 20 seed) {:ref-kinds test-ref-kinds})]
                       (:rule f)))]
      (is (= #{:place-inside :acyclic :kind-fits :refs-closed :unique-key :namespace :ref-kind} rules)))))

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
    :edits  [[:remove '(place-findings s areas)]]}
   {:name   :no-cycle-rule
    :doc    "A containment cycle is no finding."
    :target `validate/validate
    :edits  [[:remove '(cycle-findings s)]]}
   {:name   :no-kind-rule
    :doc    "A kind that its container cannot contain is no finding."
    :target `validate/validate
    :edits  [[:remove '(kind-findings s may-contain areas)]]}
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
    :edits  [[:replace '(env-target? target) '(vector? target)]]}
   {:name   :no-unique-key-rule
    :doc    "Two snippets with one name are no finding."
    :target `validate/validate
    :edits  [[:remove '(unique-key-findings s unique-keys)]]}
   {:name   :unique-key-exact
    :doc    "A name key is compared as it is, so two snippets named Filter and filter pass."
    :target `validate/unique-key-findings
    :edits  [[:replace '(snapshot/unique-key unique-keys item) '(some->> (get-in unique-keys [kind :path]) (get-in item))]]}
   {:name   :unique-key-per-place
    :doc    "A key is unique only among siblings, so two snippets with one name in two collections pass."
    :target `validate/unique-key-findings
    :edits  [[:replace '[kind k] '[kind (:place item) k] {:nth 0}]]}
   {:name   :no-namespace-rule
    :doc    "A child collection in another namespace than its parent is no finding."
    :target `validate/validate
    :edits  [[:remove '(namespace-findings s areas)]]}
   {:name   :no-ref-kind-rule
    :doc    "An action on a question is no finding."
    :target `validate/validate
    :edits  [[:remove '(ref-kind-findings s ref-kinds)]]}
   {:name   :no-area-roots
    :doc    "A place that names an area root is a finding, so every item at the top level of an area is refused."
    :target `validate/place-findings
    :edits  [[:replace '(not (contains? areas place)) true]]}
   {:name   :area-id-dropped
    :doc    "The identity of the Snippets area root is not a fixed root, so every snippet at the top level is refused."
    :target `snapshot/area-roots
    :edits  [[:replace "snippetssnippetssnipp" "snippetssnippetssnipX"]]}
   {:name   :no-area-kinds
    :doc    "An area root holds an item of any kind, so a glossary term can be at the root of the Snippets area."
    :target `validate/kind-findings
    :edits  [[:replace '(:kinds area) nil]]}
   {:name   :no-area-namespace
    :doc    "A collection at an area root can have any namespace."
    :target `validate/namespace-findings
    :edits  [[:replace '(not= (:namespace attrs) (:namespace area)) false]]}
   {:name   :no-area-root-rule
    :doc    "An item with the identity of an area root is no finding."
    :target `validate/validate
    :edits  [[:remove '(area-root-findings s areas)]]}
   {:name   :ref-kind-env-fits
    :doc    "An environment object fits every role, so an action can name a table as its model."
    :target `validate/ref-kind-findings
    :edits  [[:replace '(env-target? target) false]]}])

(deftest validate-mutations-test
  (mut/check mutations {:tests [#'well-formed-test #'place-inside-test #'acyclic-test #'kind-fits-test #'area-root-test
                                #'refs-closed-test #'root-test #'unique-key-test #'namespace-test
                                #'action-model-test #'several-findings-test
                                #'arbitrary-snapshot-findings-test #'ref-kinds-findings-test #'roots-test]}))
