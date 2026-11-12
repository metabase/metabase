(ns hooks.metabase.premium-features.defenterprise-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.metabase.premium-features.defenterprise :as defenterprise]))

(defn- name-meta
  "The metadata maps the `defenterprise` hook puts on the var name of `form`, a string."
  [form]
  (let [let-node  (:node (defenterprise/defenterprise {:node (hooks/parse-string form)}))
        defn-node (nth (:children let-node) 2)]
    (map hooks/sexpr (:meta (second (:children defn-node))))))

(deftest ^:parallel defenterprise-enterprise-ns-test
  (testing "an OSS defenterprise names the enterprise namespace it dispatches to"
    (is (= [{:metabase/enterprise-ns "metabase-enterprise.foo"}]
           (name-meta "(defenterprise f \"Doc.\" metabase-enterprise.foo [x] x)"))))
  (testing "existing metadata on the name is kept"
    (is (= #{{:private true} {:metabase/enterprise-ns "metabase-enterprise.foo"}}
           (set (name-meta "(defenterprise ^{:private true} f \"Doc.\" metabase-enterprise.foo [x] x)")))))
  (testing "an enterprise defenterprise gets none"
    (is (empty? (name-meta "(defenterprise f \"Doc.\" :feature :any [x] x)")))))
