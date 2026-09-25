(ns hooks.clojure.core.def-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.def]
   [hooks.clojure.core.defn]))

(defn- lint-def
  "Lint the def form in string `s`. A string, not a quoted form, because `pr-str` drops `^:dynamic`."
  [s]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/discourage-dynamic-vars {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.def/lint-def {:node (hooks/parse-string s)})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel discourage-dynamic-vars-test
  (testing "BEGUILD-37: new dynamic vars are flagged so the ratchet budget stops them from growing"
    (are [s] (=? [{:type :metabase/discourage-dynamic-vars}]
                 (lint-def s))
      "(def ^:dynamic *x* nil)"
      "(def ^:private ^:dynamic *x* nil)"
      "(def ^:dynamic ^:private *x* nil)"
      "(def ^{:dynamic true} *x* nil)"
      "(def ^{:private true, :dynamic true} *x* nil)"
      "(def ^:dynamic *x* \"docstring\" nil)"
      "(defonce ^:dynamic *x* nil)")))

(deftest ^:parallel discourage-dynamic-vars-location-test
  (testing "the finding sits on the form, not the name, so an ignore above a multi-line def suppresses it"
    (is (=? [{:row 1 :col 1}]
            (lint-def "(def ^{:dynamic true\n       :doc \"docs\"}\n  *x*\n  nil)")))))

(deftest ^:parallel discourage-dynamic-vars-mu-defn-test
  (testing "BEGUILD-37: mu/defn is linted as schema.core/defn, so it needs its own hook"
    (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/discourage-dynamic-vars {:level :warning}}}
                                          :ignores    (atom nil)
                                          :findings   (atom [])
                                          :namespaces (atom {})}]
      (hooks.clojure.core.def/lint-dynamic
       {:node (hooks/parse-string "(mu/defn- ^:dynamic *f* :- :string [x :- :int] (str x))")})
      (is (=? [{:type :metabase/discourage-dynamic-vars}]
              @(:findings clj-kondo.impl.utils/*ctx*))))))

(deftest ^:parallel discourage-dynamic-vars-mu-defn-ok-test
  (testing "lint-dynamic runs only the dynamic check, not the def naming checks"
    (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/discourage-dynamic-vars           {:level :warning}
                                                                 :metabase/check-def-no-underscores          {:level :warning}
                                                                 :metabase/check-def-check-not-uppercase-name {:level :warning}}}
                                          :ignores    (atom nil)
                                          :findings   (atom [])
                                          :namespaces (atom {})}]
      (hooks.clojure.core.def/lint-dynamic
       {:node (hooks/parse-string "(mu/defn SOME_FN :- :string [x :- :int] (str x))")})
      (is (= [] @(:findings clj-kondo.impl.utils/*ctx*))))))

(deftest ^:parallel discourage-dynamic-vars-defn-test
  (testing "BEGUILD-37: dynamic fns go through the defn hook and are flagged too"
    (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/discourage-dynamic-vars {:level :warning}}}
                                          :ignores    (atom nil)
                                          :findings   (atom [])
                                          :namespaces (atom {})}]
      (hooks.clojure.core.defn/lint-defn {:node (hooks/parse-string "(defn ^:dynamic *f* [] nil)")})
      (is (=? [{:type :metabase/discourage-dynamic-vars}]
              @(:findings clj-kondo.impl.utils/*ctx*))))))

(deftest ^:parallel discourage-dynamic-vars-ok-test
  (testing "non-dynamic defs are not flagged"
    (are [s] (= [] (lint-def s))
      "(def x nil)"
      "(def ^:private x nil)"
      "(def ^{:dynamic false} x nil)"
      "(def ^{:private true} x nil)")))
