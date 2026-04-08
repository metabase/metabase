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
  (testing "`internally-visible?` is the trust-boundary rule for sibling / ancestor-descendant access"
    (let [internally-visible? (hook-fn 'internally-visible?)]
      (testing "same module"
        (is (true? (internally-visible? 'lib 'lib))))
      (testing "parent sees descendant (direct and deep)"
        (is (true? (internally-visible? 'lib 'lib.schema)))
        (is (true? (internally-visible? 'lib 'lib.schema.foo))))
      (testing "descendant → ancestor is NOT internally visible (must go through parent's :api)"
        (is (false? (internally-visible? 'lib.schema 'lib)))
        (is (false? (internally-visible? 'lib.schema.foo 'lib))))
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
    (let [config {:metabase/modules {'lib             {:open #{}}
                                     'lib.schema      {:api  #{}
                                                       :uses #{}}
                                     'query-processor {:uses #{'lib}
                                                       :api  #{}}}}]
      ;; query-processor declares :uses lib, and lib does not open lib.schema.
      ;; So query-processor should not be able to reach lib.schema.foo.
      ;; Note: :api #{} on lib means no namespaces are in lib's api — empty
      ;; is treated as "unspecified" in the current hook (returns default
      ;; <module>.api / .core / .init triple). For test clarity we give lib
      ;; an explicit :api below in a more targeted test.
      (is (some? (usage-error config 'query-processor 'metabase.lib.schema.foo))))))

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
