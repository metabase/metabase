(ns hooks.metabase.proof-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.defn]
   [hooks.clojure.core.ns]
   [hooks.metabase.proof :as proof]))

(defn- findings-of
  "Run `hook` on `form` as if it appeared in namespace `ns-sym` with kondo `config`, and return the findings."
  [hook form ns-sym config]
  (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (let [input  {:node     (hooks/parse-string (pr-str form))
                  :ns       ns-sym
                  :config   config
                  :filename "src/metabase/foo/bar.clj"}
          output (hook input)]
      (is (identical? (:node input) (:node output))
          "the hook must return the node unchanged so Kondo's normal analysis still runs")
      @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel constructor-test
  (let [config {:linters {:metabase/proof-constructor {:level :warning}}}
        form   '(proof/->Proof :model/Card :update 1 {} nil :x nonce)]
    (testing "the constructor is flagged outside the proof namespace"
      (is (=? [{:type    :metabase/proof-constructor
                :message #".*Only metabase.proof.impl may construct a proof.*"}]
              (findings-of proof/lint-constructor-call form 'metabase.queries.db config)))
      (is (=? [{:type :metabase/proof-constructor}]
              (findings-of proof/lint-constructor-call form 'metabase.proof.impl-test config))))
    (testing "the proof namespace itself may construct proofs"
      (is (empty? (findings-of proof/lint-constructor-call form 'metabase.proof.impl config))))))

(defn- lint-ns [form]
  (let [config {:linters {:metabase/proof-constructor {:level :warning}}}]
    (findings-of hooks.clojure.core.ns/lint-ns form nil config)))

(deftest ^:parallel class-import-test
  (testing "importing the proof class is flagged outside the proof namespace"
    (is (=? [{:type    :metabase/proof-constructor
              :message #".*Only metabase.proof.impl may import the proof class.*"}]
            (lint-ns '(ns metabase.queries.db
                        (:import
                         metabase.proof.impl.Proof)))))
    (is (=? [{:type :metabase/proof-constructor}]
            (lint-ns '(ns metabase.queries.db
                        (:import
                         (metabase.proof.impl Proof)))))))
  (testing "the proof namespace and unrelated imports are fine"
    (is (empty? (lint-ns '(ns metabase.proof.impl
                            (:import
                             (java.io Writer))))))
    (is (empty? (lint-ns '(ns metabase.queries.db
                            (:import
                             (java.io Writer)
                             metabase.util.secret.Secret)))))))

(deftest ^:parallel system-issuer-callers-test
  (let [config '{:linters {:metabase/dangerously-issue-system-proof
                           {:level             :warning
                            :test-only-callers #{"-test$" metabase.test.util}}}}]
    (testing "every system issuer call outside the proof namespace is flagged, whoever the caller is"
      (is (=? [{:type    :metabase/dangerously-issue-system-proof
                :message #"serdes-load issues a proof with no user check.*:metabase/dangerously-issue-system-proof.*"}]
              (findings-of proof/lint-system-issuer-call
                           '(proof/serdes-load write)
                           'metabase.models.serialization
                           config)))
      (is (=? [{:type :metabase/dangerously-issue-system-proof}]
              (findings-of proof/lint-system-issuer-call
                           '(metabase.proof.impl/provisioning {:model :model/Collection, :operation :create})
                           'metabase.collections.models.collection
                           config)))
      (is (=? [{:type :metabase/dangerously-issue-system-proof}]
              (findings-of proof/lint-system-issuer-call '(proof/spec-update write)
                           'metabase.models.util.spec-update config))))
    (testing "the proof namespace itself is not flagged"
      (is (empty? (findings-of proof/lint-system-issuer-call '(provisioning write) 'metabase.proof.impl config))))
    (testing "test-only is exempt from the configured test callers: a regex string or an exact namespace symbol"
      (is (empty? (findings-of proof/lint-system-issuer-call '(proof/test-only write)
                               'metabase.queries.api-test config)))
      (is (empty? (findings-of proof/lint-system-issuer-call '(proof/test-only write)
                               'metabase.test.util config)))
      (is (=? [{:type :metabase/dangerously-issue-system-proof}]
              (findings-of proof/lint-system-issuer-call '(proof/test-only write) 'metabase.queries.api config))))
    (testing "the exemption is for test-only alone"
      (is (=? [{:type :metabase/dangerously-issue-system-proof}]
              (findings-of proof/lint-system-issuer-call '(proof/serdes-load write)
                           'metabase.queries.api-test config))))))

(deftest ^:parallel proof-gated-mutator-test
  (let [config '{:linters          {:metabase/proof-gated-mutator {:level :warning}}
                 :metabase/modules {snippets {:proof-gated true}
                                    timeline {}}}
        lint   (fn [form ns-sym]
                 (findings-of hooks.clojure.core.defn/lint-defn form ns-sym config))]
    (testing "a mutator in a gated module's db namespace must take proof first"
      (is (=? [{:type    :metabase/proof-gated-mutator
                :message #".*snippets is proof-gated.*"}]
              (lint '(defn insert-snippet! "Insert." [snippet] (insert-row :model/NativeQuerySnippet snippet))
                    'metabase.snippets.db)))
      (is (empty? (lint '(defn insert-snippet! "Insert." [proof] (insert-row :model/NativeQuerySnippet (changes proof)))
                        'metabase.snippets.db))))
    (testing "every arity is checked, and docstrings and attr-maps are skipped"
      (is (=? [{:type :metabase/proof-gated-mutator}]
              (lint '(defn update-snippet!
                       "Update."
                       {:added "0.1"}
                       ([proof] (update-snippet! proof nil))
                       ([id changes] (update-row :model/NativeQuerySnippet id changes)))
                    'metabase.snippets.db)))
      (is (empty? (lint '(defn- update-snippet! ([proof] nil) ([proof opts] nil))
                        'metabase.snippets.db))))
    (testing "non-mutating functions, other namespaces, and ungated modules are left alone"
      (is (empty? (lint '(defn snippet-by-id [id] (select-one :model/NativeQuerySnippet :id id))
                        'metabase.snippets.db)))
      (is (empty? (lint '(defn insert-snippet! [snippet] nil) 'metabase.snippets.models.snippet)))
      (is (empty? (lint '(defn insert-event! [event] nil) 'metabase.timeline.db)))
      (is (empty? (lint '(defn insert-thing! [thing] nil) 'metabase.unlisted.db))))
    (testing "enterprise modules are gated the same way"
      (is (=? [{:type :metabase/proof-gated-mutator}]
              (findings-of hooks.clojure.core.defn/lint-defn
                           '(defn insert-thing! [thing] nil)
                           'metabase-enterprise.sandbox.db
                           (assoc-in config [:metabase/modules 'enterprise/sandbox :proof-gated] true)))))))
