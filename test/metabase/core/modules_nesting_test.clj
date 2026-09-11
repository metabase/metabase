(ns metabase.core.modules-nesting-test
  "Tests nested-module resolution and access rules against fixture configs."
  (:require
   [clojure.test :refer :all]
   [dev.deps-graph]
   [hooks.common.modules :as modules]))

(set! *warn-on-reflection* true)

;;;; -------------------------------------------------------------------------
;;;; Namespace resolution
;;;; -------------------------------------------------------------------------

(deftest ^:parallel module-resolution-longest-prefix-test
  (let [config {:metabase/modules {'lib        {}
                                   'lib.schema {}}}]
    (testing "resolves to the most-specific declared ancestor"
      (is (= 'lib.schema (modules/module config 'metabase.lib.schema.foo)))
      (is (= 'lib.schema (modules/module config 'metabase.lib.schema.nested.deeper))))
    (testing "falls back to parent when deeper child isn't declared"
      (is (= 'lib (modules/module config 'metabase.lib.core))))
    (testing "an undeclared metabase namespace resolves to a module named for its first segment"
      (is (= 'query-processor (modules/module config 'metabase.query-processor.foo)))
      (is (= 'enterprise/transforms (modules/module config 'metabase-enterprise.transforms.core))))
    (testing "namespaces outside metabase resolve to nil"
      (is (nil? (modules/module config 'clojure.core)))
      (is (nil? (modules/module config 'clj-kondo.impl.config))))))

(deftest ^:parallel module-resolution-enterprise-dotted-children-test
  (let [config {:metabase/modules {'enterprise/transforms        {}
                                   'enterprise/transforms.python {}}}]
    (is (= 'enterprise/transforms.python
           (modules/module config 'metabase-enterprise.transforms.python.runner)))
    (is (= 'enterprise/transforms
           (modules/module config 'metabase-enterprise.transforms.core)))))

(deftest ^:parallel module-resolution-three-level-nesting-test
  (let [config {:metabase/modules {'outer                {}
                                   'outer.middle         {}
                                   'outer.middle.deepest {}}}]
    (is (= 'outer.middle.deepest (modules/module config 'metabase.outer.middle.deepest.foo)))
    (is (= 'outer.middle (modules/module config 'metabase.outer.middle.other)))
    (is (= 'outer (modules/module config 'metabase.outer.top)))))

(deftest ^:parallel module-resolution-test-namespace-suffix-stripping-test
  (testing "a trailing `-test` resolves like the namespace it tests"
    (let [config {:metabase/modules {'driver     {}
                                     'lib        {}
                                     'lib.schema {}}}]
      (is (= 'driver (modules/module config 'metabase.driver-test)))
      (is (= 'lib.schema (modules/module config 'metabase.lib.schema-test))))))

;;;; -------------------------------------------------------------------------
;;;; Custom namespace prefixes
;;;; -------------------------------------------------------------------------

(deftest ^:parallel default-ns-prefix-test
  (is (= "metabase.lib" (modules/default-ns-prefix 'lib)))
  (is (= "metabase.lib.schema" (modules/default-ns-prefix 'lib.schema)))
  (is (= "metabase.query-processor" (modules/default-ns-prefix 'query-processor)))
  (is (= "metabase-enterprise.transforms" (modules/default-ns-prefix 'enterprise/transforms)))
  (is (= "metabase-enterprise.transforms.python" (modules/default-ns-prefix 'enterprise/transforms.python))))

(deftest ^:parallel module-ns-prefix-explicit-override-test
  (let [modules '{lib        {}
                  lib.be     {:ns-prefix "metabase.lib-be"}
                  lib.schema {}}]
    (is (= "metabase.lib" (modules/module-ns-prefix modules 'lib)))
    (is (= "metabase.lib-be" (modules/module-ns-prefix modules 'lib.be)))
    (is (= "metabase.lib.schema" (modules/module-ns-prefix modules 'lib.schema)))))

(deftest ^:parallel module-resolution-explicit-ns-prefix-test
  (let [config {:metabase/modules {'lib             {}
                                   'lib.schema      {}
                                   'lib.be          {:ns-prefix "metabase.lib-be"}
                                   'lib.legacy-mbql {:ns-prefix "metabase.legacy-mbql"}}}]
    (testing "hyphenated source namespace resolves to the nested module"
      (is (= 'lib.be (modules/module config 'metabase.lib-be.core)))
      (is (= 'lib.be (modules/module config 'metabase.lib-be.models.query))))
    (testing "unrelated hyphenated namespace resolves to its own nested module"
      (is (= 'lib.legacy-mbql (modules/module config 'metabase.legacy-mbql.util)))
      (is (= 'lib.legacy-mbql (modules/module config 'metabase.legacy-mbql.schema.macros))))
    (testing "default-prefixed sibling still resolves correctly"
      (is (= 'lib.schema (modules/module config 'metabase.lib.schema.foo))))
    (testing "parent resolves to itself for its own namespaces"
      (is (= 'lib (modules/module config 'metabase.lib.core))))))

(deftest ^:parallel module-resolution-segment-boundary-test
  (let [config {:metabase/modules {'lib    {}
                                   'lib.be {:ns-prefix "metabase.lib-be"}}}]
    (testing "`metabase.lib-be.foo` matches `metabase.lib-be` at segment boundary"
      (is (= 'lib.be (modules/module config 'metabase.lib-be.foo))))
    (testing "`metabase.lib-bert.foo` does not match `metabase.lib-be` mid-segment"
      (is (= 'lib-bert (modules/module config 'metabase.lib-bert.foo))))
    (testing "exact match works"
      (is (= 'lib.be (modules/module config 'metabase.lib-be))))))

(deftest ^:parallel build-prefix->module-test
  (is (= {"metabase.lib"             'lib
          "metabase.lib-be"          'lib.be
          "metabase.query-processor" 'query-processor}
         (modules/build-prefix->module '{lib             {}
                                         lib.be          {:ns-prefix "metabase.lib-be"}
                                         query-processor {}}))))

(deftest ^:parallel descendant-api-generation-is-monotonic-test
  (let [deps        [{:namespace 'metabase.parent.child.core
                      :module    'parent.child
                      :deps      [{:namespace 'metabase.parent.internal
                                   :module    'parent}]}]
        base-config '{parent       {:api #{}}
                      parent.child {:uses #{parent}}}]
    (testing "a new descendant-only use does not become public API"
      (is (= #{}
             (dev.deps-graph/externally-used-namespaces-ignoring-friends
              deps base-config 'parent))))
    (testing "a pre-existing API remains stable while a descendant still uses it"
      (is (= '#{metabase.parent.internal}
             (dev.deps-graph/externally-used-namespaces-ignoring-friends
              deps (assoc-in base-config ['parent :api] '#{metabase.parent.internal}) 'parent))))))

(deftest ^:parallel simulate-rename-preserves-nested-module-ownership-test
  (let [prefix->module {"metabase.parent"       'parent
                        "metabase.parent.child" 'parent.child}
        deps           [{:namespace 'metabase.consumer.core
                         :module    'consumer
                         :deps      [{:namespace 'metabase.old.core
                                      :module    'old}]}]
        renamed        (#'dev.deps-graph/simulate-rename
                        deps prefix->module {'metabase.old.core 'metabase.parent.child.core})]
    (is (= 'parent.child (:module (first (:deps (first renamed))))))))

;;;; -------------------------------------------------------------------------
;;;; Module tree
;;;; -------------------------------------------------------------------------

(deftest ^:parallel parent-module-test
  (testing "a dotted name's parent is its prefix"
    (is (= 'lib (modules/parent-module {} 'lib.schema)))
    (is (= 'lib.schema (modules/parent-module {} 'lib.schema.foo)))
    (is (= 'enterprise/transforms (modules/parent-module '{transforms {}} 'enterprise/transforms.python))))
  (testing "top-level modules have no parent"
    (is (nil? (modules/parent-module {} 'lib)))
    (is (nil? (modules/parent-module {} 'enterprise/internal-stats))))
  (testing "`enterprise/X` sits under OSS `X` only when `X` is declared"
    (is (= 'internal-stats (modules/parent-module '{internal-stats {}} 'enterprise/internal-stats)))
    (is (nil? (modules/parent-module '{other-module {}} 'enterprise/internal-stats)))))

(deftest ^:parallel descendant-of?-test
  (let [modules '{lib {}, lib.schema {}, lib.schema.foo {}, transforms {}, enterprise/transforms {}}]
    (is (modules/descendant-of? modules 'lib.schema.foo 'lib))
    (is (modules/descendant-of? modules 'lib 'lib) "a module sits in its own subtree")
    (is (not (modules/descendant-of? modules 'lib 'lib.schema)) "an ancestor is not a descendant")
    (is (modules/descendant-of? modules 'enterprise/transforms 'transforms))
    (is (not (modules/descendant-of? modules 'lib.schema 'transforms)))))

(deftest ^:parallel blocking-export-test
  (let [blocking-export #'modules/blocking-export
        leaf-config     '{outer {}, outer.a {}, outer.a.leaf {}}]
    (testing "top-level modules are never blocked"
      (is (nil? (blocking-export '{lib {}} 'lib))))
    (testing "an unexported child is blocked at its parent"
      (is (= '{:ancestor lib, :child lib.schema}
             (blocking-export '{lib {}, lib.schema {}} 'lib.schema))))
    (testing "an exported child is not"
      (is (nil? (blocking-export '{lib {:module-exports #{lib.schema}}, lib.schema {}} 'lib.schema))))
    (testing "each export widens the scope by exactly one level"
      (is (= '{:ancestor outer.a, :child outer.a.leaf}
             (blocking-export leaf-config 'outer.a.leaf)))
      (is (= '{:ancestor outer, :child outer.a}
             (blocking-export (assoc-in leaf-config ['outer.a :module-exports] '#{outer.a.leaf}) 'outer.a.leaf)))
      (is (nil? (blocking-export (-> leaf-config
                                     (assoc-in ['outer.a :module-exports] '#{outer.a.leaf})
                                     (assoc-in ['outer :module-exports] '#{outer.a}))
                                 'outer.a.leaf))))
    (testing "`X` exports its declared `enterprise/X` child implicitly"
      (is (nil? (blocking-export '{cache {}, enterprise/cache {}} 'enterprise/cache))))
    (testing "a dotted child of an `enterprise/` module needs an explicit export"
      (is (= '{:ancestor enterprise/transforms, :child enterprise/transforms.python}
             (blocking-export '{transforms {}, enterprise/transforms {}, enterprise/transforms.python {}}
                              'enterprise/transforms.python))))))

;;;; -------------------------------------------------------------------------
;;;; Access rules
;;;; -------------------------------------------------------------------------

(deftest ^:parallel usage-error-parent-needs-explicit-uses-and-api-test
  (testing "a parent must declare its child in :uses and use the child's :api"
    (let [config-without-uses
          {:metabase/modules {'lib        {:uses #{}}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}}}]
      (is (some? (modules/usage-error config-without-uses 'lib 'metabase.lib.schema.foo))
          "lib does not declare :uses #{lib.schema}"))
    (let [config-with-uses
          {:metabase/modules {'lib        {:uses #{'lib.schema}}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}}}]
      (testing "namespace in lib.schema's :api — allowed"
        (is (nil? (modules/usage-error config-with-uses 'lib 'metabase.lib.schema.foo))))
      (testing "namespace not in lib.schema's :api — denied even though lib is the parent"
        (is (some? (modules/usage-error config-with-uses 'lib 'metabase.lib.schema.private-ns)))))))

(deftest ^:parallel usage-error-siblings-need-explicit-uses-and-api-test
  (testing "siblings must declare :uses and use each other's :api"
    (let [config-without-uses
          {:metabase/modules {'lib        {}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}
                              'lib.be     {:api  :any
                                           :uses #{}}}}]
      (is (some? (modules/usage-error config-without-uses 'lib.be 'metabase.lib.schema.foo))
          "lib.be does not declare :uses #{lib.schema}"))
    (let [config-with-uses
          {:metabase/modules {'lib        {}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}
                              'lib.be     {:api  :any
                                           :uses #{'lib.schema}}}}]
      (is (nil? (modules/usage-error config-with-uses 'lib.be 'metabase.lib.schema.foo))
          "the namespace is in lib.schema's API")
      (is (some? (modules/usage-error config-with-uses 'lib.be 'metabase.lib.schema.private-ns))
          "the namespace is not in lib.schema's API"))))

(deftest ^:parallel usage-error-child-must-declare-uses-on-parent-test
  (testing "a child must declare its parent in :uses but may use internal namespaces"
    (let [config-without-uses
          {:metabase/modules {'lib        {:api  #{'metabase.lib.core}
                                           :uses #{}}
                              'lib.schema {:api  :any
                                           :uses #{}}}}]
      (is (some? (modules/usage-error config-without-uses 'lib.schema 'metabase.lib.core))
          "lib.schema does not declare :uses #{lib}"))
    (let [config-with-uses
          {:metabase/modules {'lib        {:api  #{'metabase.lib.core}
                                           :uses #{}}
                              'lib.schema {:api  :any
                                           :uses #{'lib}}}}]
      (testing "namespace in lib's :api — allowed"
        (is (nil? (modules/usage-error config-with-uses 'lib.schema 'metabase.lib.core))))
      (testing "namespace not in lib's :api — also allowed (subtree trust)"
        (is (nil? (modules/usage-error config-with-uses 'lib.schema 'metabase.lib.internal)))))))

(deftest ^:parallel usage-error-encapsulated-grandchild-denied-test
  (testing "an outside module cannot reach an unexported nested module"
    (let [config {:metabase/modules {'lib             {:module-exports #{}
                                                       :api            #{'metabase.lib.core}
                                                       :uses           #{}}
                                     'lib.schema      {:api  #{'metabase.lib.schema.public-ns}
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  :any}}}]
      (testing "access to a private descendant namespace is denied"
        (is (some? (modules/usage-error config 'query-processor 'metabase.lib.schema.private-ns))))
      (testing "access to lib's own API is allowed"
        (is (nil? (modules/usage-error config 'query-processor 'metabase.lib.core))))
      (testing "access to lib.schema's own :api is also denied — lib does not export lib.schema"
        (is (some? (modules/usage-error config 'query-processor 'metabase.lib.schema.public-ns)))))))

(deftest ^:parallel usage-error-opened-child-allowed-test
  (testing "an outside module can reach a child exported by its parent"
    (let [config {:metabase/modules {'lib             {:module-exports #{'lib.schema}
                                                       :api            :any}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib.schema}
                                                       :api  :any}}}]
      (is (nil? (modules/usage-error config 'query-processor 'metabase.lib.schema.foo))))))

(deftest ^:parallel usage-error-subtree-trust-is-unidirectional-test
  (let [config {:metabase/modules {'outer              {:uses #{'outer.middle.inner}
                                                        :api  #{'metabase.outer.public}}
                                   'outer.middle       {:api #{}}
                                   'outer.middle.inner {:api  #{'metabase.outer.middle.inner.public}
                                                        :uses #{'outer}}}}]
    (testing "grandchild → grandparent bypasses :api"
      (is (nil? (modules/usage-error config 'outer.middle.inner 'metabase.outer.internal))))
    (testing "grandparent → grandchild must go through grandchild's :api"
      (is (some? (modules/usage-error config 'outer 'metabase.outer.middle.inner.internal))))
    (testing "grandparent → grandchild can access the grandchild's public :api"
      (is (nil? (modules/usage-error config 'outer 'metabase.outer.middle.inner.public))))))

(deftest ^:parallel usage-error-subtree-trust-does-not-extend-to-cousins-test
  (let [config {:metabase/modules {'outer        {}
                                   'outer.a      {}
                                   'outer.a.leaf {:api  #{'metabase.outer.a.leaf.public}
                                                  :uses #{}}
                                   'outer.b      {}
                                   'outer.b.leaf {:api  :any
                                                  :uses #{'outer.a.leaf}}}}]
    (testing "namespace in cousin's :api — allowed"
      (is (nil? (modules/usage-error config 'outer.b.leaf 'metabase.outer.a.leaf.public))))
    (testing "namespace not in cousin's :api — denied"
      (is (some? (modules/usage-error config 'outer.b.leaf 'metabase.outer.a.leaf.internal))))))

(deftest ^:parallel usage-error-uses-must-name-resolved-module-exactly-test
  (testing "`:uses` must name the resolved module exactly"
    (let [config {:metabase/modules {'lib             {:api  :any
                                                       :uses #{}}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  :any}}}]
      (is (some? (modules/usage-error config 'query-processor 'metabase.lib.schema.foo))
          ":uses #{lib} does not cover lib.schema even though lib is its parent")
      (is (nil? (modules/usage-error config 'query-processor 'metabase.lib.core))
          "the namespace resolves directly to lib")
      (is (nil? (modules/usage-error (assoc-in config [:metabase/modules 'query-processor :uses] #{'lib 'lib.schema})
                                     'query-processor
                                     'metabase.lib.schema.foo))
          "query-processor declares lib.schema explicitly"))))

(deftest ^:parallel usage-error-explicit-empty-api-denies-external-access-test
  (let [config {:metabase/modules {'private-module {:api #{}}
                                   'caller         {:uses #{'private-module}}}}]
    (testing "an explicit empty API exports no namespaces"
      (is (some? (modules/usage-error config 'caller 'metabase.private-module.api))))
    (testing "`:api :any` remains the unrestricted API sentinel"
      (is (nil? (modules/usage-error (assoc-in config [:metabase/modules 'private-module :api] :any)
                                     'caller
                                     'metabase.private-module.internal))))
    (testing "friends may still bypass an explicitly empty API"
      (is (nil? (modules/usage-error (assoc-in config [:metabase/modules 'private-module :friends] #{'caller})
                                     'caller
                                     'metabase.private-module.internal))))))

(deftest ^:parallel usage-error-uses-any-namability-test
  (testing "`:uses :any` may name any module it could name with a set-valued `:uses`"
    (let [config {:metabase/modules {'lib        {:api :any}
                                     'lib.schema {:api :any}
                                     'caller     {:uses :any
                                                  :api  :any}}}]
      (testing "top-level modules are always visible"
        (is (nil? (modules/usage-error config 'caller 'metabase.lib.core))))
      (testing "a nested child not in its parent's :module-exports is private to its subtree"
        (is (some? (modules/usage-error config 'caller 'metabase.lib.schema.foo))))
      (testing "exporting the child makes it visible everywhere"
        (is (nil? (modules/usage-error (assoc-in config [:metabase/modules 'lib :module-exports] #{'lib.schema})
                                       'caller
                                       'metabase.lib.schema.foo))))
      (testing "same-subtree callers may name private children"
        (is (nil? (modules/usage-error (assoc-in config [:metabase/modules 'lib.other] {:uses :any, :api :any})
                                       'lib.other
                                       'metabase.lib.schema.foo)))))))

(deftest ^:parallel usage-error-privacy-scoped-to-nearest-non-opening-ancestor-test
  (testing "An unexported child is private to its nearest non-exporting ancestor's subtree, not the top-level one"
    (let [config {:metabase/modules {'outer        {:module-exports #{}
                                                    :uses           :any
                                                    :api            :any}
                                     'outer.a      {:module-exports #{}
                                                    :uses           :any
                                                    :api            :any}
                                     'outer.a.leaf {:uses :any
                                                    :api  :any}
                                     'outer.a.sib  {:uses :any
                                                    :api  :any}
                                     'outer.b      {:module-exports #{}
                                                    :uses           :any
                                                    :api            :any}
                                     'outer.b.deep {:uses :any
                                                    :api  :any}}}]
      (testing "the nearest non-opening ancestor and its descendants may name it"
        (is (nil? (modules/usage-error config 'outer.a 'metabase.outer.a.leaf.foo)))
        (is (nil? (modules/usage-error config 'outer.a.sib 'metabase.outer.a.leaf.foo))))
      (testing "a cousin sharing only the top-level ancestor may not name it"
        (is (some? (modules/usage-error config 'outer.b 'metabase.outer.a.leaf.foo)))
        (is (some? (modules/usage-error config 'outer.b.deep 'metabase.outer.a.leaf.foo))))
      (testing "an ancestor above the nearest non-opening ancestor may not name it either"
        (is (some? (modules/usage-error config 'outer 'metabase.outer.a.leaf.foo))))
      (testing "exporting the leaf one level up widens the scope to the whole `outer` subtree"
        (let [config (assoc-in config [:metabase/modules 'outer.a :module-exports] #{'outer.a.leaf})]
          (is (nil? (modules/usage-error config 'outer 'metabase.outer.a.leaf.foo)))
          (is (nil? (modules/usage-error config 'outer.b 'metabase.outer.a.leaf.foo)))
          (is (nil? (modules/usage-error config 'outer.b.deep 'metabase.outer.a.leaf.foo)))
          (testing "but not to a module outside the `outer` subtree"
            (let [config (assoc-in config [:metabase/modules 'unrelated] {:uses :any, :api :any})]
              (is (= (str "Module outer.a.leaf is nested and not exported by its ancestors; "
                          "unrelated may not use it. Add outer.a to outer's :module-exports, "
                          "or move the caller into the outer subtree. "
                          "[:metabase/modules outer :module-exports]")
                     (modules/usage-error config 'unrelated 'metabase.outer.a.leaf.foo))))))))))

(deftest ^:parallel usage-error-uses-any-rest-module-test
  (testing "`:uses :any` does not allow domain modules to depend on REST modules"
    (let [config {:metabase/modules {'actions      {:api :any}
                                     'actions.rest {:ns-prefix "metabase.actions-rest"
                                                    :api       :any}
                                     'caller       {:uses :any
                                                    :api  :any}}}]
      (is (= (str "Do not use -rest modules (actions.rest) in non-rest modules (caller) "
                  "-- move things from actions.rest to actions if needed")
             (modules/usage-error config 'caller 'metabase.actions-rest.api))))))

(deftest ^:parallel usage-error-rest-module-exceptions-test
  (testing "REST modules, route aggregators, and core initializers may use REST modules"
    (let [config {:metabase/modules {'actions        {:module-exports #{'actions.rest}
                                                      :api            :any}
                                     'actions.rest   {:ns-prefix "metabase.actions-rest"
                                                      :api       :any}
                                     'questions.rest {:ns-prefix "metabase.questions-rest"
                                                      :uses      :any
                                                      :api       :any}
                                     'api-routes     {:uses :any
                                                      :api  :any}
                                     'core           {:uses :any
                                                      :api  :any}}}]
      (are [caller] (nil? (modules/usage-error config caller 'metabase.actions-rest.api))
        'questions.rest
        'api-routes
        'core))))

;;;; -------------------------------------------------------------------------
;;;; Enterprise companion modules
;;;;
;;;; A declared `enterprise/X` sits under OSS `X` and is exported implicitly.
;;;; Without OSS `X`, it remains top-level.
;;;; -------------------------------------------------------------------------

(deftest ^:parallel usage-error-enterprise-shorthand-allows-cross-subtree-access-test
  (testing "enterprise/core can require enterprise/cache because cache exports it implicitly"
    (let [config {:metabase/modules {'core             {:api :any}
                                     'cache            {:api :any}
                                     'enterprise/core  {:api  :any
                                                        :uses #{'enterprise/cache}}
                                     'enterprise/cache {:api  :any
                                                        :uses #{}}}}]
      (is (nil? (modules/usage-error config 'enterprise/core 'metabase-enterprise.cache.core))))))

(deftest ^:parallel usage-error-enterprise-shorthand-same-subtree-access-test
  (testing "OSS X and enterprise/X share X's subtree"
    (let [config {:metabase/modules {'cache            {:api  :any
                                                        :uses #{'enterprise/cache}}
                                     'enterprise/cache {:api  :any
                                                        :uses #{'cache}}}}]
      (testing "OSS cache → enterprise/cache"
        (is (nil? (modules/usage-error config 'cache 'metabase-enterprise.cache.core))))
      (testing "enterprise/cache → OSS cache"
        (is (nil? (modules/usage-error config 'enterprise/cache 'metabase.cache.core)))))))

(deftest ^:parallel usage-error-enterprise-without-oss-counterpart-stays-top-level-test
  (testing "enterprise/X without a declared OSS X is top-level, so anyone may name it"
    (let [config {:metabase/modules {'enterprise/sandbox {:api  :any
                                                          :uses #{}}
                                     'unrelated          {:api  :any
                                                          :uses #{'enterprise/sandbox}}}}]
      (is (nil? (modules/usage-error config 'unrelated 'metabase-enterprise.sandbox.core))))))

(deftest ^:parallel usage-error-backwards-compat-flat-config-test
  (testing "a config without nested modules keeps flat-module behavior"
    (let [config {:metabase/modules {'lib             {:api  #{'metabase.lib.core
                                                               'metabase.lib.schema.foo}
                                                       :uses #{}}
                                     'query-processor {:api  :any
                                                       :uses #{'lib}}}}]
      (testing "flat :uses lib is sufficient for namespaces in lib's api"
        (is (nil? (modules/usage-error config 'query-processor 'metabase.lib.core)))
        (is (nil? (modules/usage-error config 'query-processor 'metabase.lib.schema.foo))))
      (testing "namespaces not in :api are denied"
        (is (some? (modules/usage-error config 'query-processor 'metabase.lib.internal)))))))
