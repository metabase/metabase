(ns metabase.core.modules-nesting-test
  "Tests for the nested-modules mechanism: longest-prefix namespace→module
  resolution and `:open`-based visibility.

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

;;;; -------------------------------------------------------------------------
;;;; Visibility helpers (parent-module, ancestor-chain, siblings?, etc.)
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

(deftest ^:parallel siblings?-test
  (testing "`siblings?` is true for two modules with the same direct parent"
    (let [siblings? (hook-fn 'siblings?)]
      (is (true?  (siblings? 'lib.schema 'lib.be)))
      (is (true?  (siblings? 'lib.be 'lib.schema)))
      (is (false? (siblings? 'lib.schema 'lib.schema.foo))) ; parent vs child
      (is (false? (siblings? 'lib.schema 'lib)))            ; child vs parent
      (is (false? (siblings? 'lib 'query-processor)))       ; both top-level, no shared parent
      (is (false? (siblings? 'lib 'lib))))))                 ; same module

;;;; -------------------------------------------------------------------------
;;;; :open set and external-face
;;;; -------------------------------------------------------------------------

(deftest ^:parallel open-children-test
  (testing "`open-children` returns the set declared under `:open` on the parent"
    (let [open-children (hook-fn 'open-children)
          config {:metabase/modules {'lib {:open #{'lib.schema 'lib.be}}}}]
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
        (let [config {:metabase/modules {'lib {:open #{'lib.schema}}}}]
          (is (true? (externally-visible? config 'lib.schema)))))
      (testing "a nested module whose parent does NOT open it is NOT visible"
        (let [config {:metabase/modules {'lib {:open #{}}}}]
          (is (false? (externally-visible? config 'lib.schema)))))
      (testing "a grandchild is visible only if both its parent and grandparent open the chain"
        (let [ok       {:metabase/modules {'outer        {:open #{'outer.middle}}
                                           'outer.middle {:open #{'outer.middle.deepest}}}}
              bad-mid  {:metabase/modules {'outer        {:open #{}}
                                           'outer.middle {:open #{'outer.middle.deepest}}}}
              bad-deep {:metabase/modules {'outer        {:open #{'outer.middle}}
                                           'outer.middle {:open #{}}}}]
          (is (true?  (externally-visible? ok       'outer.middle.deepest)))
          (is (false? (externally-visible? bad-mid  'outer.middle.deepest)))
          (is (false? (externally-visible? bad-deep 'outer.middle.deepest))))))))

(deftest ^:parallel external-face-test
  (testing "`external-face` returns the closest externally-visible ancestor (or the module itself)"
    (let [external-face (hook-fn 'external-face)]
      (testing "top-level module is its own face"
        (is (= 'lib (external-face {} 'lib))))
      (testing "unopened child's face is its parent"
        (let [config {:metabase/modules {'lib {:open #{}}}}]
          (is (= 'lib (external-face config 'lib.schema)))))
      (testing "opened child's face is itself"
        (let [config {:metabase/modules {'lib {:open #{'lib.schema}}}}]
          (is (= 'lib.schema (external-face config 'lib.schema)))))
      (testing "grandchild of unopened child falls through to the grandparent"
        (let [config {:metabase/modules {'lib        {:open #{}}
                                         'lib.schema {:open #{'lib.schema.foo}}}}]
          ;; lib.schema.foo's parent opens it, but lib does NOT open lib.schema,
          ;; so the whole subtree is encapsulated behind `lib`.
          (is (= 'lib (external-face config 'lib.schema.foo))))))))

;;;; -------------------------------------------------------------------------
;;;; internally-visible? (parent→descendant, sibling rules)
;;;; -------------------------------------------------------------------------

(deftest ^:parallel internally-visible?-test
  (testing "`internally-visible?` is the subsystem trust-boundary rule — symmetric ancestor/descendant/sibling access"
    (let [internally-visible? (hook-fn 'internally-visible?)]
      (testing "same module"
        (is (true? (internally-visible? 'lib 'lib))))
      (testing "parent sees descendant (direct and deep)"
        (is (true? (internally-visible? 'lib 'lib.schema)))
        (is (true? (internally-visible? 'lib 'lib.schema.foo))))
      (testing "descendant sees ancestor (symmetric with parent-sees-descendant — this is the :friends replacement)"
        (is (true? (internally-visible? 'lib.schema 'lib)))
        (is (true? (internally-visible? 'lib.schema.foo 'lib)))
        (is (true? (internally-visible? 'lib.schema.foo 'lib.schema))))
      (testing "siblings see each other"
        (is (true? (internally-visible? 'lib.schema 'lib.be)))
        (is (true? (internally-visible? 'lib.be 'lib.schema))))
      (testing "unrelated top-level modules don't see each other internally"
        (is (false? (internally-visible? 'lib 'query-processor)))
        (is (false? (internally-visible? 'query-processor 'lib))))
      (testing "cousins (same grandparent, different parent) don't see each other"
        (is (false? (internally-visible? 'outer.one.foo 'outer.two.bar)))))))

;;;; -------------------------------------------------------------------------
;;;; usage-error behavior under nesting
;;;; -------------------------------------------------------------------------

(defn- usage-error [config current-module required-namespace]
  ((hook-fn 'usage-error) config current-module required-namespace))

(deftest ^:parallel usage-error-parent-sees-descendant-internals-test
  (testing "Parent accessing descendant namespace is allowed without :uses or :api declaration"
    (let [config {:metabase/modules {'lib        {:uses #{}}
                                     'lib.schema {:api #{}
                                                  :uses #{}}}}]
      (is (nil? (usage-error config 'lib 'metabase.lib.schema.foo)))
      (is (nil? (usage-error config 'lib 'metabase.lib.schema.nested.thing))))))

(deftest ^:parallel usage-error-sibling-access-test
  (testing "Siblings see each other's internals without :api check"
    (let [config {:metabase/modules {'lib        {:open #{}}
                                     'lib.schema {:uses #{}
                                                  :api  #{}}
                                     'lib.be     {:uses #{}
                                                  :api  #{}}}}]
      (is (nil? (usage-error config 'lib.be 'metabase.lib.schema.foo)))
      (is (nil? (usage-error config 'lib.schema 'metabase.lib.be.core))))))

(deftest ^:parallel usage-error-encapsulated-grandchild-denied-test
  (testing "Outside module cannot reach into an unopened nested module"
    ;; `lib.schema` is nested under `lib` but lib does not open it, so
    ;; lib.schema is encapsulated behind lib. Outside callers see only
    ;; lib's :api and cannot reach lib.schema's contents — even if
    ;; lib.schema's own :api declares those namespaces. This is strict
    ;; encapsulation: :open is the only way to expose a nested child.
    ;;
    ;; Note: the hook currently treats `(empty? api-set)` as "allow
    ;; anything" (matching the :any case), so to get real encapsulation
    ;; behavior in a fixture you must provide a non-empty :api that
    ;; excludes the namespace being tested.
    (let [config {:metabase/modules {'lib             {:open #{}
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
        ;; this would be for lib to explicitly `:open #{lib.schema}` or
        ;; for lib to re-export the namespace in its own :api.
        (is (some? (usage-error config 'query-processor 'metabase.lib.schema.public-ns)))))))

(deftest ^:parallel usage-error-opened-child-allowed-test
  (testing "Outside module CAN reach into an opened nested module when listed in :open"
    (let [config {:metabase/modules {'lib             {:open #{'lib.schema}
                                                       :api  :any}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib.schema}
                                                       :api  :any}}}]
      (is (nil? (usage-error config 'query-processor 'metabase.lib.schema.foo))))))

(deftest ^:parallel usage-error-uses-lib-covers-opened-child-test
  (testing "Listing the parent in :uses covers the opened child via the external-face mechanism"
    (let [config {:metabase/modules {'lib             {:open #{'lib.schema}
                                                       :api  :any}
                                     'lib.schema      {:api  :any
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  :any}}}]
      ;; query-processor declares :uses lib (the top-level parent). The required
      ;; namespace resolves to lib.schema (longest-prefix). lib.schema is
      ;; externally visible because lib opens it, and its external face is itself.
      ;; The direct :uses entry for lib is accepted since the required module is
      ;; a descendant of lib.
      (is (nil? (usage-error config 'query-processor 'metabase.lib.schema.foo))))))

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
