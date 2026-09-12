(ns dev.security-lint.rule-test
  (:require
   [clojure.test :refer :all]
   [dev.security-lint.rule :as rule]))

(defn- with-clean-registry [f]
  (binding [rule/*registry* (atom {})] (f)))

(deftest defrule-registers-test
  (with-clean-registry
    (fn []
      (rule/register!
       {:id :test/demo :name "Demo" :description "d" :severity :error :precision :high
        :cwe "CWE-1" :triggers '#{a.b/c} :detect (fn [_] nil)})
      (is (= [:test/demo] (map :id (rule/all))))
      (is (= "Demo" (:name (rule/by-id :test/demo)))))))

(deftest register-validates-test
  (with-clean-registry
    (fn []
      (testing "rejects unknown severity"
        (is (thrown-with-msg?
             Exception #"severity"
             (rule/register! {:id :t/x :name "n" :description "d" :severity :fatal :precision :high
                              :cwe "C" :triggers '#{a/b} :detect (fn [_] nil)}))))
      (testing "rejects a rule with no triggers"
        (is (thrown-with-msg?
             Exception #"trigger"
             (rule/register! {:id :t/x :name "n" :description "d" :severity :error :precision :high
                              :cwe "C" :detect (fn [_] nil)}))))
      (testing "rejects unqualified trigger symbols"
        (is (thrown-with-msg?
             Exception #"qualified"
             (rule/register! {:id :t/x :name "n" :description "d" :severity :error :precision :high
                              :cwe "C" :triggers '#{bare} :detect (fn [_] nil)}))))
      (testing "rejects a missing description"
        (is (thrown? Exception
                     (rule/register! {:id :t/x :name "n" :severity :error :precision :high
                                      :cwe "C" :triggers '#{a/b} :detect (fn [_] nil)})))))))

(deftest defrule-macro-test
  (with-clean-registry
    (fn []
      (eval '(dev.security-lint.rule/defrule demo-rule
               {:name "Demo rule" :description "desc" :severity :warning :precision :medium
                :cwe "CWE-77" :triggers #{some.ns/f}}
               [ctx]
               (when (:hit ctx) {:message "found it"})))
      (let [r (rule/by-id :metabase-security-lint/demo-rule)]
        (is (some? r) "derives id from the rule name")
        (is (= :warning (:severity r)))
        (is (= '#{some.ns/f} (:triggers r)))
        (is (= {:message "found it"} ((:detect r) {:hit true})))
        (is (nil? ((:detect r) {:hit false})))))))

(deftest exempts-test
  (testing "a rule can exempt the namespace that legitimately owns the dangerous operation"
    (let [r {:exempt-files [#"^src/metabase/util/http\.clj$"]}]
      (is (true? (rule/exempt? r "src/metabase/util/http.clj")))
      (is (false? (rule/exempt? r "src/metabase/api/card.clj")))))
  (testing "no exemptions means nothing is exempt"
    (is (false? (rule/exempt? {} "src/anything.clj")))))

(deftest severity-map-test
  (testing "a severity may depend on whether the value reaching the sink is attacker-influenced"
    (let [r {:severity {:tainted :error :otherwise :note}}]
      (is (= :error (rule/severity-for r true)))
      (is (= :note (rule/severity-for r false)))
      (is (= :error (rule/worst-severity r)) "the rule-level default is the worse of the two")))
  (testing "a plain severity is used either way"
    (let [r {:severity :warning}]
      (is (= :warning (rule/severity-for r true)))
      (is (= :warning (rule/severity-for r false)))
      (is (= :warning (rule/worst-severity r))))))

(deftest severity-map-validation-test
  (with-clean-registry
    (fn []
      (testing "both branches must name a known severity"
        (is (thrown-with-msg?
             Exception #"severity"
             (rule/register! {:id :t/x :name "n" :description "d" :precision :high :cwe "C"
                              :severity {:tainted :error :otherwise :fatal}
                              :triggers '#{a/b} :detect (fn [_] nil)}))))
      (testing "a valid severity map is accepted"
        (is (some? (rule/register! {:id :t/ok :name "n" :description "d" :precision :high :cwe "C"
                                    :severity {:tainted :error :otherwise :note}
                                    :triggers '#{a/b} :detect (fn [_] nil)})))))))
