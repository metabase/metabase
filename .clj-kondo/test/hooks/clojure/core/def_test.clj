(ns hooks.clojure.core.def-test
  (:require
   [clj-kondo.core :as kondo]
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.def]))

(defn- lint-def
  "Lint the def form in string `s`. A string, not a quoted form, because `pr-str` drops `^:dynamic`."
  [s]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/discourage-dynamic-vars {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.def/lint-def {:node (hooks/parse-string s)})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(defn- config-findings
  "Lint string `s` as `lang` with the real `.clj-kondo` config and return the findings whose type is in `types`."
  [types lang s]
  (->> (with-in-str s (kondo/run! {:lint ["-"] :lang lang :config-dir ".clj-kondo" :cache false}))
       :findings
       (filter (comp types :type))))

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
      "(defonce ^:dynamic *x* nil)"
      "(defn f {:dynamic true} [] nil)"
      "(defn f \"docstring\" {:dynamic true} [] nil)"
      "(defn f \"docstring\" ([] 1) ([a] a) {:dynamic true})"
      "(mu/defn f :- :int \"docstring\" {:dynamic true} [] 1)")))

(deftest ^:parallel discourage-dynamic-vars-location-test
  (testing "the finding sits on the form, so `kondo-insert-ignores` puts the ignore above the form, not inside it"
    (is (=? [{:row 1 :col 1}]
            (lint-def "(def ^{:dynamic true\n       :doc \"docs\"}\n  *x*\n  nil)")))))

(deftest ^:parallel discourage-dynamic-vars-ok-test
  (testing "non-dynamic defs are not flagged"
    (are [s] (= [] (lint-def s))
      "(def x nil)"
      "(def ^:private x nil)"
      "(def ^{:dynamic false} x nil)"
      "(def ^{:private true} x nil)"
      "(def x {:dynamic true})"
      "(defonce x {:dynamic true})"
      "(clojure.core/def x {:dynamic true})"
      "(clojure.core/defonce x {:dynamic true})"
      "(cljs.core/defonce x {:dynamic true})"
      "(defn f {:private true} [] nil)"
      "(defn f [] {:dynamic true})"
      "(defn f ([] 1) ([a] {:dynamic true}))")))

(deftest ^:synchronized discourage-dynamic-vars-config-test
  (testing "BEGUILD-37: config.edn sends defn, the mu/defn variants, and cljs defs to the dynamic-var check"
    (are [lang s] (=? [{:row 1}] (config-findings #{:metabase/discourage-dynamic-vars} lang s))
      :clj  "(ns x) (defn ^:dynamic *f* [] nil)"
      :clj  "(ns x (:require [metabase.util.malli :as mu])) (mu/defn ^:dynamic *f* :- :int [] 1)"
      :clj  "(ns x (:require [metabase.util.malli :as mu])) (mu/defn- ^:dynamic *f* :- :int [] 1)"
      :clj  "(ns x (:require [metabase.util.malli.defn :as mu.defn])) (mu.defn/defn ^:dynamic *f* :- :int [] 1)"
      :clj  "(ns x (:require [metabase.util.malli.defn :as mu.defn])) (mu.defn/defn- ^:dynamic *f* :- :int [] 1)"
      :cljs "(ns x) (def ^:dynamic *x* 1)"
      :cljs "(ns x) (defn ^:dynamic *f* [] nil)"
      :cljs "(ns x) (defn- ^:dynamic *f* [] nil)"
      :cljs "(ns x) (defonce ^:dynamic *x* 1)"
      :cljc "(ns x) #?(:cljs (def ^:dynamic *x* 1))")))

(deftest ^:synchronized discourage-dynamic-vars-naming-checks-test
  (testing "lint-dynamic runs only the dynamic check, not the def naming checks"
    (are [lang s] (= [] (config-findings #{:metabase/check-def-no-underscores :metabase/check-def-check-not-uppercase-name}
                                         lang s))
      :clj  "(ns x (:require [metabase.util.malli :as mu])) (mu/defn SOME_FN :- :string [x :- :int] (str x))"
      :cljs "(ns x) (def SOME_VALUE 1)")))
