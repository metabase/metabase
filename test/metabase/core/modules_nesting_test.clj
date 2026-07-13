(ns metabase.core.modules-nesting-test
  "Tests for the nested-modules mechanism: longest-prefix namespace→module
  resolution and `:module-exports`-based visibility.

  The kondo hook at `.clj-kondo/src/hooks/common/modules.clj` lives in
  clj-kondo's isolated classpath and cannot be `require`d from the test
  classpath directly. To test it, we `load-file` the hook source into the
  test JVM, creating the `hooks.common.modules` namespace on-the-fly.

  These tests use **fixture configs** — hand-constructed maps shaped like
  the real `:metabase/modules` config — to exercise the hook's resolution
  and visibility logic in isolation. No production config is read."
  (:require
   [clojure.test :refer :all]
   [dev.deps-graph]))

(set! *warn-on-reflection* true)

;; Load the kondo hook source into this test JVM so we can call its functions.
;; The hook only depends on `clojure.string`, so this is safe.
(load-file ".clj-kondo/src/hooks/common/modules.clj")

;; Resolve hook functions via the namespace (which was just created by
;; load-file). We use `ns-resolve` rather than direct references because
;; the namespace isn't required at compile time.
(def ^:private hook-ns (find-ns 'hooks.common.modules))

(defn- hook-fn [sym]
  (let [v (ns-resolve hook-ns sym)]
    (assert v (str "hooks.common.modules/" sym " not found"))
    v))

;;;; -------------------------------------------------------------------------
;;;; Longest-prefix module resolution
;;;; -------------------------------------------------------------------------

(deftest ^:parallel module-resolution-single-arg-is-flat-test
  (testing "Single-arg `module` uses flat first-segment extraction regardless of config"
    (let [module (hook-fn 'module)]
      (is (= 'lib                    (module 'metabase.lib.schema.foo)))
      (is (= 'lib                    (module 'metabase.lib.core)))
      (is (= 'query-processor        (module 'metabase.query-processor.middleware.foo)))
      (is (= 'enterprise/transforms  (module 'metabase-enterprise.transforms.core)))
      (is (nil? (module 'clojure.core)))
      (is (nil? (module 'clj-kondo.impl.config))))))

(deftest ^:parallel module-resolution-two-arg-with-empty-config-is-flat-test
  (testing "Two-arg `module` with empty/nil config degenerates to flat extraction"
    (let [module (hook-fn 'module)]
      (is (= 'lib (module nil 'metabase.lib.schema.foo)))
      (is (= 'lib (module {} 'metabase.lib.schema.foo)))
      (is (= 'lib (module {:metabase/modules {}} 'metabase.lib.schema.foo))))))

(deftest ^:parallel module-resolution-longest-prefix-test
  (testing "Two-arg `module` does longest-prefix matching against declared modules"
    (let [module (hook-fn 'module)
          config {:metabase/modules {'lib        {}
                                     'lib.schema {}}}]
      (testing "resolves to the most-specific declared ancestor"
        (is (= 'lib.schema (module config 'metabase.lib.schema.foo)))
        (is (= 'lib.schema (module config 'metabase.lib.schema.nested.deeper))))
      (testing "falls back to parent when deeper child isn't declared"
        (is (= 'lib (module config 'metabase.lib.core))))
      (testing "unrelated namespaces still hit the flat fallback"
        (is (= 'query-processor (module config 'metabase.query-processor.foo)))))))

(deftest ^:parallel module-resolution-enterprise-dotted-children-test
  (testing "Enterprise dotted children resolve correctly"
    (let [module (hook-fn 'module)
          config {:metabase/modules {'enterprise/transforms         {}
                                     'enterprise/transforms.python  {}}}]
      (is (= 'enterprise/transforms.python
             (module config 'metabase-enterprise.transforms.python.runner)))
      (is (= 'enterprise/transforms
             (module config 'metabase-enterprise.transforms.core))))))

(deftest ^:parallel module-resolution-three-level-nesting-test
  (testing "Three-level nesting: longest-prefix walks down through multiple declared ancestors"
    (let [module (hook-fn 'module)
          config {:metabase/modules {'outer                {}
                                     'outer.middle         {}
                                     'outer.middle.deepest {}}}]
      (is (= 'outer.middle.deepest
             (module config 'metabase.outer.middle.deepest.foo)))
      (is (= 'outer.middle
             (module config 'metabase.outer.middle.other)))
      (is (= 'outer
             (module config 'metabase.outer.top))))))

(deftest ^:parallel module-resolution-test-namespace-suffix-stripping-test
  (testing "`-test` suffix on the first segment is stripped (legacy behavior)"
    (let [module (hook-fn 'module)]
      (is (= 'driver (module 'metabase.driver-test))))))

;;;; -------------------------------------------------------------------------
;;;; :ns-prefix — explicit override of the name-derived default
;;;; -------------------------------------------------------------------------

(deftest ^:parallel default-ns-prefix-test
  (testing "`default-ns-prefix` derives the prefix string from the module name"
    (let [default-ns-prefix (hook-fn 'default-ns-prefix)]
      (is (= "metabase.lib"                         (default-ns-prefix 'lib)))
      (is (= "metabase.lib.schema"                  (default-ns-prefix 'lib.schema)))
      (is (= "metabase.query-processor"             (default-ns-prefix 'query-processor)))
      (is (= "metabase-enterprise.transforms"       (default-ns-prefix 'enterprise/transforms)))
      (is (= "metabase-enterprise.transforms.python"
             (default-ns-prefix 'enterprise/transforms.python))))))

(deftest ^:parallel module-ns-prefix-explicit-override-test
  (testing "`module-ns-prefix` returns explicit `:ns-prefix` when set, else default"
    (let [module-ns-prefix (hook-fn 'module-ns-prefix)
          config {:metabase/modules {'lib        {}
                                     'lib.be     {:ns-prefix "metabase.lib-be"}
                                     'lib.schema {}}}]
      (is (= "metabase.lib"         (module-ns-prefix config 'lib)))
      (is (= "metabase.lib-be"      (module-ns-prefix config 'lib.be)))
      (is (= "metabase.lib.schema"  (module-ns-prefix config 'lib.schema))))))

(deftest ^:parallel module-resolution-explicit-ns-prefix-test
  (testing "Namespace resolution respects explicit `:ns-prefix` on a module"
    (let [module (hook-fn 'module)
          config {:metabase/modules {'lib        {}
                                     'lib.schema {}
                                     'lib.be     {:ns-prefix "metabase.lib-be"}
                                     'lib.legacy-mbql {:ns-prefix "metabase.legacy-mbql"}}}]
      (testing "hyphenated source namespace resolves to the nested module"
        (is (= 'lib.be (module config 'metabase.lib-be.core)))
        (is (= 'lib.be (module config 'metabase.lib-be.models.query))))
      (testing "unrelated hyphenated namespace resolves to its own nested module"
        (is (= 'lib.legacy-mbql (module config 'metabase.legacy-mbql.util)))
        (is (= 'lib.legacy-mbql (module config 'metabase.legacy-mbql.schema.macros))))
      (testing "default-prefixed sibling still resolves correctly"
        (is (= 'lib.schema (module config 'metabase.lib.schema.foo))))
      (testing "parent resolves to itself for its own namespaces"
        (is (= 'lib (module config 'metabase.lib.core)))))))

(deftest ^:parallel module-resolution-segment-boundary-test
  (testing "Longest-prefix matching only accepts matches at segment boundaries"
    (let [module (hook-fn 'module)
          config {:metabase/modules {'lib    {}
                                     'lib.be {:ns-prefix "metabase.lib-be"}}}]
      (testing "`metabase.lib-be.foo` matches `metabase.lib-be` at segment boundary"
        (is (= 'lib.be (module config 'metabase.lib-be.foo))))
      (testing "`metabase.lib-bert.foo` does NOT match `metabase.lib-be` (mid-segment)"
        ;; No declared prefix matches at a segment boundary, so the primary
        ;; path returns nil. The fallback single-segment regex returns the
        ;; first segment after `metabase.` literally — `lib-bert` — which is
        ;; NOT `lib.be`.
        (is (not= 'lib.be (module config 'metabase.lib-bert.foo)))
        (is (= 'lib-bert (module config 'metabase.lib-bert.foo))))
      (testing "exact match works"
        (is (= 'lib.be (module config 'metabase.lib-be))))
      (testing "unrelated namespace outside the declared set falls through to flat fallback"
        (is (= 'query-processor (module config 'metabase.query-processor.foo)))))))

(deftest ^:parallel build-prefix->module-test
  (testing "`build-prefix->module` assembles the lookup map from declared modules"
    (let [build-prefix->module (hook-fn 'build-prefix->module)
          config {:metabase/modules {'lib    {}
                                     'lib.be {:ns-prefix "metabase.lib-be"}
                                     'query-processor {}}}
          result (build-prefix->module config)]
      (is (= {"metabase.lib"             'lib
              "metabase.lib-be"          'lib.be
              "metabase.query-processor" 'query-processor}
             result)))))

(deftest ^:parallel descendant-api-generation-is-monotonic-test
  (let [deps [{:namespace 'metabase.parent.child.core
               :module 'parent.child
               :deps [{:namespace 'metabase.parent.internal
                       :module 'parent}]}]
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

(deftest default-dependency-helpers-use-configured-prefixes-test
  (let [config '{parent       {}
                 parent.child {:ns-prefix metabase.special-child}}
        seen-prefixes (promise)]
    (with-redefs [dev.deps-graph/kondo-config (constantly config)
                  dev.deps-graph/dependencies (fn [prefix->module]
                                                (deliver seen-prefixes prefix->module)
                                                [])]
      (is (= [] (dev.deps-graph/external-usages 'parent)))
      (is (= (dev.deps-graph/build-prefix->module config) @seen-prefixes)))))

(deftest ^:parallel simulate-rename-preserves-nested-module-ownership-test
  (let [prefix->module {"metabase.parent" 'parent
                        "metabase.parent.child" 'parent.child}
        deps [{:namespace 'metabase.consumer.core
               :module 'consumer
               :deps [{:namespace 'metabase.old.core
                       :module 'old}]}]
        renamed (#'dev.deps-graph/simulate-rename
                 deps prefix->module {'metabase.old.core 'metabase.parent.child.core})]
    (is (= 'parent.child (:module (first (:deps (first renamed))))))))

;;;; -------------------------------------------------------------------------
;;;; Visibility helpers (parent-module, ancestor-chain, etc.)
;;;; -------------------------------------------------------------------------

(deftest ^:parallel parent-module-test
  (testing "`parent-module` derives the parent from a dotted name"
    (let [parent-module (hook-fn 'parent-module)]
      (is (= 'lib          (parent-module 'lib.schema)))
      (is (= 'lib.schema   (parent-module 'lib.schema.foo)))
      (is (nil?            (parent-module 'lib)))
      (is (= 'enterprise/transforms (parent-module 'enterprise/transforms.python)))
      (is (nil?            (parent-module 'enterprise/transforms))))))

(deftest ^:parallel ancestor-chain-test
  (testing "`ancestor-chain` returns the seq of ancestors from direct parent up"
    (let [ancestor-chain (hook-fn 'ancestor-chain)]
      (is (= '(lib.schema lib)     (ancestor-chain 'lib.schema.foo)))
      (is (= '(lib)                (ancestor-chain 'lib.schema)))
      (is (= ()                    (ancestor-chain 'lib)))
      (is (= '(enterprise/transforms)
             (ancestor-chain 'enterprise/transforms.python))))))

;;;; -------------------------------------------------------------------------
;;;; :module-exports set
;;;; -------------------------------------------------------------------------

(deftest ^:parallel open-children-test
  (testing "`open-children` returns the set declared under `:module-exports` on the parent"
    (let [open-children (hook-fn 'open-children)
          config {:metabase/modules {'lib {:module-exports #{'lib.schema 'lib.be}}}}]
      (is (= #{'lib.schema 'lib.be} (open-children config 'lib)))
      (is (= #{}                     (open-children config 'query-processor)))
      (is (= #{}                     (open-children {} 'lib))))))

(deftest ^:parallel externally-visible?-test
  (testing "A module is externally visible iff every ancestor is either top-level or opened by its parent"
    (let [externally-visible? (hook-fn 'externally-visible?)]
      (testing "top-level modules are always externally visible"
        (is (true? (externally-visible? {} 'lib)))
        (is (true? (externally-visible? {} 'query-processor))))
      (testing "a nested module whose parent opens it is visible (parent is top-level)"
        (let [config {:metabase/modules {'lib {:module-exports #{'lib.schema}}}}]
          (is (true? (externally-visible? config 'lib.schema)))))
      (testing "a nested module whose parent does NOT open it is NOT visible"
        (let [config {:metabase/modules {'lib {:module-exports #{}}}}]
          (is (false? (externally-visible? config 'lib.schema)))))
      (testing "a grandchild is visible only if both its parent and grandparent open the chain"
        (let [ok       {:metabase/modules {'outer        {:module-exports #{'outer.middle}}
                                           'outer.middle {:module-exports #{'outer.middle.deepest}}}}
              bad-mid  {:metabase/modules {'outer        {:module-exports #{}}
                                           'outer.middle {:module-exports #{'outer.middle.deepest}}}}
              bad-deep {:metabase/modules {'outer        {:module-exports #{'outer.middle}}
                                           'outer.middle {:module-exports #{}}}}]
          (is (true?  (externally-visible? ok       'outer.middle.deepest)))
          (is (false? (externally-visible? bad-mid  'outer.middle.deepest)))
          (is (false? (externally-visible? bad-deep 'outer.middle.deepest))))))))

;;;; -------------------------------------------------------------------------
;;;; STRICT MODEL: every cross-module access is an explicit :uses + :api
;;;; check. There is no implicit visibility of any kind. Same-module access
;;;; is the only thing that bypasses the lint, and that's just because
;;;; there's no module boundary to cross.
;;;;
;;;; The `internally-visible?` helper has been removed entirely; the
;;;; visibility-question tests below cover the strict model directly.
;;;; -------------------------------------------------------------------------

;;;; -------------------------------------------------------------------------
;;;; usage-error behavior under nesting
;;;; -------------------------------------------------------------------------

(defn- synthesize-ns-for-module
  "Given a module symbol and its config entry, produce a plausible namespace
  symbol that resolves to that module. Used in test fixtures where the exact
  caller namespace doesn't matter — we just need something the module
  resolver recognizes as belonging to the module."
  [config module-sym]
  (let [prefix (or (get-in config [:metabase/modules module-sym :ns-prefix])
                   (if (= (namespace module-sym) "enterprise")
                     (str "metabase-enterprise." (name module-sym))
                     (str "metabase." (name module-sym))))]
    (symbol (str prefix ".core"))))

(defn- usage-error
  "Test helper that calls the loaded kondo hook's `usage-error`.

  Three-arg form: pass a module symbol as the caller. The helper synthesizes
  a plausible namespace for that module (`<ns-prefix>.core`) and passes it
  as `current-ns` to the real function. Use this when the test doesn't
  care about the caller's specific namespace.

  Four-arg form: pass both `current-ns` and `current-module` explicitly.
  Use this when the test specifically exercises behavior that depends on
  which namespace inside the module is doing the require — e.g., the
  `:private` rule that allows only `<parent>.init`/`.core` to load
  private children."
  ([config current-module required-namespace]
   (usage-error config
                (synthesize-ns-for-module config current-module)
                current-module
                required-namespace))
  ([config current-ns current-module required-namespace]
   ((hook-fn 'usage-error) config current-ns current-module required-namespace)))

(deftest ^:parallel usage-error-parent-needs-explicit-uses-and-api-test
  (testing "Parent accessing descendant must declare :uses AND obey the child's :api"
    (let [config-without-uses
          {:metabase/modules {'lib        {:uses #{}}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}}}]
      (is (some? (usage-error config-without-uses 'lib 'metabase.lib.schema.foo))
          "lib does not declare :uses #{lib.schema} so the access is denied"))
    (let [config-with-uses
          {:metabase/modules {'lib        {:uses #{'lib.schema}}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}}}]
      (testing "namespace in lib.schema's :api — allowed"
        (is (nil? (usage-error config-with-uses 'lib 'metabase.lib.schema.foo))))
      (testing "namespace NOT in lib.schema's :api — denied even though lib is the parent"
        ;; Subtree trust is UNIDIRECTIONAL: descendants can read their
        ;; ancestors' internals, but ancestors must respect their
        ;; descendants' :api. The child's :api is its outward-facing
        ;; contract, and even its parent must go through it.
        (is (some? (usage-error config-with-uses 'lib 'metabase.lib.schema.private-ns)))))))

(deftest ^:parallel usage-error-siblings-need-explicit-uses-and-api-test
  (testing "Siblings must declare :uses and go through each other's :api — no sibling trust"
    (let [config-without-uses
          {:metabase/modules {'lib        {}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}
                              'lib.be     {:api  :any
                                           :uses #{}}}}]
      (is (some? (usage-error config-without-uses 'lib.be 'metabase.lib.schema.foo))
          "lib.be does not declare :uses #{lib.schema}, so even sibling access is denied"))
    (let [config-with-uses
          {:metabase/modules {'lib        {}
                              'lib.schema {:api  #{'metabase.lib.schema.foo}
                                           :uses #{}}
                              'lib.be     {:api  :any
                                           :uses #{'lib.schema}}}}]
      (is (nil? (usage-error config-with-uses 'lib.be 'metabase.lib.schema.foo))
          "with :uses declared and the namespace in lib.schema's :api, the access is allowed")
      (is (some? (usage-error config-with-uses 'lib.be 'metabase.lib.schema.private-ns))
          "even with :uses declared, namespaces NOT in lib.schema's :api are denied"))))

(deftest ^:parallel usage-error-child-must-declare-uses-on-parent-test
  (testing "Child accessing parent must declare :uses, but :api is waived by subtree trust"
    (let [config-without-uses
          {:metabase/modules {'lib        {:api  #{'metabase.lib.core}
                                           :uses #{}}
                              'lib.schema {:api  :any
                                           :uses #{}}}}]
      (is (some? (usage-error config-without-uses 'lib.schema 'metabase.lib.core))
          "lib.schema does not declare :uses #{lib} so it cannot access lib's namespaces"))
    (let [config-with-uses
          {:metabase/modules {'lib        {:api  #{'metabase.lib.core}
                                           :uses #{}}
                              'lib.schema {:api  :any
                                           :uses #{'lib}}}}]
      (testing "namespace in lib's :api — allowed"
        (is (nil? (usage-error config-with-uses 'lib.schema 'metabase.lib.core))))
      (testing "namespace NOT in lib's :api — ALSO allowed (subtree trust)"
        (is (nil? (usage-error config-with-uses 'lib.schema 'metabase.lib.internal))
            (str "Under subtree trust, a child reaching into its parent's internals is "
                 "allowed regardless of :api — this is the ancestor-descendant relaxation."))))))

(deftest ^:parallel usage-error-encapsulated-grandchild-denied-test
  (testing "Outside module cannot reach into an unopened nested module"
    ;; `lib.schema` is nested under `lib` but lib does not open it, so
    ;; lib.schema is encapsulated behind lib. Outside callers see only
    ;; lib's :api and cannot reach lib.schema's contents — even if
    ;; lib.schema's own :api declares those namespaces. This is strict
    ;; encapsulation: :module-exports is the only way to expose a nested child.
    ;;
    ;; Note: the hook currently treats `(empty? api-set)` as "allow
    ;; anything" (matching the :any case), so to get real encapsulation
    ;; behavior in a fixture you must provide a non-empty :api that
    ;; excludes the namespace being tested.
    (let [config {:metabase/modules {'lib             {:module-exports #{}
                                                       :api  #{'metabase.lib.core}
                                                       :uses #{}}
                                     'lib.schema      {:api  #{'metabase.lib.schema.public-ns}
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  :any}}}]
      (testing "access to a private descendant namespace is denied"
        (is (some? (usage-error config 'query-processor 'metabase.lib.schema.private-ns))))
      (testing "access to lib's own api is allowed"
        (is (nil? (usage-error config 'query-processor 'metabase.lib.core))))
      (testing "access to lib.schema's own :api is ALSO denied — lib.schema is fully encapsulated"
        ;; lib.schema's :api declares `metabase.lib.schema.public-ns`, but
        ;; lib does NOT open lib.schema, so lib.schema's API is invisible
        ;; to outside callers. The only way for query-processor to reach
        ;; this would be for lib to explicitly `:module-exports #{lib.schema}` or
        ;; for lib to re-export the namespace in its own :api.
        (is (some? (usage-error config 'query-processor 'metabase.lib.schema.public-ns)))))))

(deftest ^:parallel usage-error-opened-child-allowed-test
  (testing "Outside module CAN reach into an opened nested module when listed in :module-exports"
    (let [config {:metabase/modules {'lib             {:module-exports #{'lib.schema}
                                                       :api  :any}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib.schema}
                                                       :api  :any}}}]
      (is (nil? (usage-error config 'query-processor 'metabase.lib.schema.foo))))))

(deftest ^:parallel usage-error-subtree-trust-is-unidirectional-test
  (testing "Subtree trust is UNIDIRECTIONAL: descendants can read ancestors' internals, but ancestors must respect descendants' :api"
    (let [config {:metabase/modules {'outer              {:uses #{'outer.middle.inner}
                                                          :api  #{'metabase.outer.public}}
                                     'outer.middle       {:api  #{}}
                                     'outer.middle.inner {:api  #{'metabase.outer.middle.inner.public}
                                                          :uses #{'outer}}}}]
      (testing "grandchild → grandparent bypasses :api (descendant reading ancestor)"
        (is (nil? (usage-error config 'outer.middle.inner 'metabase.outer.internal))
            (str "outer.middle.inner declares :uses on outer; the grandparent's :api is "
                 "waived because descendants can read ancestors' internals.")))
      (testing "grandparent → grandchild must go through grandchild's :api"
        (is (some? (usage-error config 'outer 'metabase.outer.middle.inner.internal))
            (str "outer declares :uses on outer.middle.inner, but the grandchild's "
                 ":api is enforced — parents (and grandparents) do NOT get free "
                 "access to their descendants' internals. The :api is the outward "
                 "contract, and even its ancestors must respect it.")))
      (testing "grandparent → grandchild CAN access the grandchild's public :api"
        (is (nil? (usage-error config 'outer 'metabase.outer.middle.inner.public)))))))

(deftest ^:parallel usage-error-subtree-trust-does-not-extend-to-cousins-test
  (testing "Cousins (same grandparent, different parents) are NOT subtree-trusted — they go through :api"
    (let [config {:metabase/modules {'outer             {}
                                     'outer.a           {}
                                     'outer.a.leaf      {:api  #{'metabase.outer.a.leaf.public}
                                                         :uses #{}}
                                     'outer.b           {}
                                     'outer.b.leaf      {:api  :any
                                                         :uses #{'outer.a.leaf}}}}]
      (testing "namespace in cousin's :api — allowed"
        (is (nil? (usage-error config 'outer.b.leaf 'metabase.outer.a.leaf.public))))
      (testing "namespace NOT in cousin's :api — denied (no subtree trust between cousins)"
        (is (some? (usage-error config 'outer.b.leaf 'metabase.outer.a.leaf.internal))
            "cousins are not in an ancestor-descendant relationship, so :api still applies")))))

(deftest ^:parallel usage-error-uses-must-name-resolved-module-exactly-test
  (testing "`:uses` is matched exactly against the resolved required module — no walking up the tree"
    (let [config {:metabase/modules {'lib             {:api  :any
                                                       :uses #{}}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  :any}}}]
      (is (some? (usage-error config 'query-processor 'metabase.lib.schema.foo))
          (str ":uses #{lib} does NOT cover lib.schema even though lib is its parent. "
               "The required namespace resolves to lib.schema (via longest-prefix matching) "
               "and the :uses entry must name lib.schema directly."))
      (is (nil? (usage-error config 'query-processor 'metabase.lib.core))
          ":uses #{lib} covers references to namespaces that resolve to lib itself"))
    (let [config {:metabase/modules {'lib             {:api  :any
                                                       :uses #{}}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib 'lib.schema}
                                                       :api  :any}}}]
      (is (nil? (usage-error config 'query-processor 'metabase.lib.schema.foo))
          "with both lib and lib.schema in :uses, the access works"))))

(deftest ^:parallel usage-error-uses-any-namability-test
  (testing "`:uses :any` allows any *namable* module reference (subject to :api); namability is enforced
            at require time for `:any` callers since the config-level test only covers set-valued `:uses`"
    (let [config {:metabase/modules {'lib        {:api  :any}
                                     'lib.schema {:api  :any}
                                     'caller     {:uses :any
                                                  :api  :any}}}]
      (testing "top-level modules are always namable"
        (is (nil? (usage-error config 'caller 'metabase.lib.core))))
      (testing "a nested child not in its parent's :module-exports is private to its subtree"
        (is (some? (usage-error config 'caller 'metabase.lib.schema.foo))))
      (testing "exporting the child makes it namable from anywhere"
        (is (nil? (usage-error (assoc-in config [:metabase/modules 'lib :module-exports] #{'lib.schema})
                               'caller
                               'metabase.lib.schema.foo))))
      (testing "same-subtree callers may name private children"
        (is (nil? (usage-error (assoc-in config [:metabase/modules 'lib.other] {:uses :any, :api :any})
                               'lib.other
                               'metabase.lib.schema.foo)))))))

(deftest ^:parallel usage-error-uses-any-rest-module-test
  (testing "`:uses :any` does not allow domain modules to depend on REST modules"
    (let [config {:metabase/modules {'actions      {:api :any}
                                     'actions.rest {:ns-prefix "metabase.actions-rest"
                                                    :api       :any}
                                     'caller       {:uses :any
                                                    :api  :any}}}
          expected (str "Do not use REST modules (actions.rest) in non-REST modules (caller) "
                        "-- move things from actions.rest to actions if needed")]
      (is (= expected (usage-error config 'caller 'metabase.actions-rest.api))))))

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
      (are [caller] (nil? (usage-error config caller 'metabase.actions-rest.api))
        'questions.rest
        'api-routes
        'core))))

;;;; -------------------------------------------------------------------------
;;;; `enterprise/X` shorthand: EE module as a nested child of OSS X
;;;;
;;;; When an `enterprise/X` module is declared in config and an OSS module
;;;; `X` is also declared, the system treats `enterprise/X` as if it were a
;;;; nested child of `X` — same subtree, auto-opened in `X`'s `:module-exports` set.
;;;; This lets EE modules be organized as companions to their OSS
;;;; counterparts without needing to rename anything or declare explicit
;;;; `:ns-prefix` / `:module-exports` entries.
;;;;
;;;; If `X` is NOT declared (e.g. `enterprise/sandbox` with no OSS
;;;; counterpart), the shorthand falls back: `enterprise/sandbox` stays a
;;;; top-level module, externally referenceable by anyone.
;;;; -------------------------------------------------------------------------

(deftest ^:parallel parent-module-shorthand-test
  (testing "`parent-module` honors the `enterprise/X` shorthand when declared modules are known"
    (let [parent-module (hook-fn 'parent-module)]
      (testing "no declared modules: enterprise/X is top-level (pure syntactic)"
        (is (nil? (parent-module 'enterprise/internal-stats))))
      (testing "empty declared set: same as no declared — no shorthand activation"
        (is (nil? (parent-module #{} 'enterprise/internal-stats))))
      (testing "declared set includes OSS X: enterprise/X's parent is X"
        (is (= 'internal-stats
               (parent-module #{'internal-stats} 'enterprise/internal-stats))))
      (testing "declared set does NOT include OSS X: enterprise/X is still top-level"
        (is (nil? (parent-module #{'other-module} 'enterprise/internal-stats))))
      (testing "dotted-name children still work via pure syntactic rule"
        (is (= 'lib
               (parent-module #{'lib} 'lib.schema))))
      (testing "deeply-nested enterprise names fall back to syntactic rule"
        (is (= 'enterprise/transforms
               (parent-module #{'transforms} 'enterprise/transforms.python)))))))

(deftest ^:parallel open-children-auto-opens-enterprise-test
  (testing "`open-children` auto-includes `enterprise/X` when X is a declared OSS top-level"
    (let [open-children (hook-fn 'open-children)]
      (testing "no enterprise counterpart declared: only the explicit :module-exports set"
        (let [config {:metabase/modules {'lib {:module-exports #{'lib.schema}}}}]
          (is (= #{'lib.schema} (open-children config 'lib)))))
      (testing "enterprise/X counterpart declared: auto-included in :module-exports"
        (let [config {:metabase/modules {'cache            {}
                                         'enterprise/cache {}}}]
          (is (= #{'enterprise/cache} (open-children config 'cache)))))
      (testing "combines explicit and auto-opened"
        (let [config {:metabase/modules {'lib             {:module-exports #{'lib.schema}}
                                         'enterprise/lib  {}}}]
          (is (= #{'lib.schema 'enterprise/lib} (open-children config 'lib)))))
      (testing "nested modules (not top-level) do NOT get auto-opened enterprise counterparts"
        ;; `foo.bar` is not top-level (has a dot in its name), so
        ;; `enterprise/foo.bar` is not auto-opened on it even if declared.
        ;; `foo.bar` has no explicit `:module-exports` set, so open-children should be #{}.
        (let [config {:metabase/modules {'foo                 {:module-exports #{'foo.bar}}
                                         'foo.bar             {}
                                         'enterprise/foo.bar  {}}}]
          (is (= #{} (open-children config 'foo.bar))))))))

(deftest ^:parallel usage-error-enterprise-shorthand-allows-cross-subtree-access-test
  (testing (str "Under the shorthand, `enterprise/X` is in the X subtree. Other modules "
                "can still reach it via the auto-opened `:module-exports` set. `enterprise/core`'s "
                "init chain, for instance, can statically require `enterprise/cache` "
                "because `cache` auto-opens `enterprise/cache`.")
    (let [config {:metabase/modules {'core              {:api :any}
                                     'cache             {:api :any}
                                     'enterprise/core   {:api :any
                                                         :uses #{'enterprise/cache}}
                                     'enterprise/cache  {:api :any
                                                         :uses #{}}}}]
      (testing "enterprise/core can statically require enterprise/cache"
        (is (nil? (usage-error config 'metabase-enterprise.core.init 'enterprise/core
                               'metabase-enterprise.cache.core)))))))

(deftest ^:parallel usage-error-enterprise-shorthand-same-subtree-access-test
  (testing "OSS X and enterprise/X are same-subtree after shorthand — both in X's subtree"
    (let [config {:metabase/modules {'cache             {:api :any
                                                         :uses #{'enterprise/cache}}
                                     'enterprise/cache  {:api :any
                                                         :uses #{'cache}}}}]
      (testing "OSS cache → enterprise/cache via :uses is allowed (same subtree)"
        (is (nil? (usage-error config 'metabase.cache.init 'cache
                               'metabase-enterprise.cache.core))))
      (testing "enterprise/cache → OSS cache via :uses is allowed (same subtree, reverse direction)"
        (is (nil? (usage-error config 'metabase-enterprise.cache.init 'enterprise/cache
                               'metabase.cache.core)))))))

(deftest ^:parallel usage-error-enterprise-without-oss-counterpart-stays-top-level-test
  (testing (str "An `enterprise/X` module whose OSS counterpart `X` is NOT declared stays "
                "top-level — no phantom parent. Anyone can name it directly since top-level "
                "modules are always externally referenceable.")
    (let [config {:metabase/modules {'enterprise/sandbox {:api :any
                                                          :uses #{}}
                                     'unrelated          {:api :any
                                                          :uses #{'enterprise/sandbox}}}}]
      ;; `unrelated` is in a different subtree, but `enterprise/sandbox`
      ;; has no OSS parent (sandbox isn't declared), so it's top-level
      ;; and externally referenceable.
      (testing "unrelated can reach top-level enterprise/sandbox"
        (is (nil? (usage-error config 'metabase.unrelated.core 'unrelated
                               'metabase-enterprise.sandbox.core)))))))

(deftest ^:parallel usage-error-backwards-compat-flat-config-test
  (testing "With no nested modules declared, behavior matches the flat pre-nesting model"
    (let [config {:metabase/modules {'lib             {:api  #{'metabase.lib.core
                                                               'metabase.lib.schema.foo}
                                                       :uses #{}}
                                     'query-processor {:api  :any
                                                       :uses #{'lib}}}}]
      (testing "flat :uses lib is sufficient for namespaces in lib's api"
        (is (nil? (usage-error config 'query-processor 'metabase.lib.core)))
        (is (nil? (usage-error config 'query-processor 'metabase.lib.schema.foo))))
      (testing "namespaces not in :api are denied"
        (is (some? (usage-error config 'query-processor 'metabase.lib.internal)))))))
