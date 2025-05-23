(ns hooks.clojure.core.defmulti-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.defmulti]))

(defn- lint-defmulti [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/check-defmulti-arglists {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.defmulti/lint-defmulti {:node (hooks/parse-string (pr-str form))})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel defmulti-missing-arglists-test
  (testing "missing arglists"
    (is (=? [{:message "All defmultis should have an attribute map with :arglists metadata. [:metabase/check-defmulti-arglists]"}]
            (lint-defmulti '(defmulti expand-visualization
                              (fn [card _ _]
                                (-> card :visualization first))))))))

(deftest ^:parallel defmulti-invalid-arglists-test
  (testing "invalid arglists"
    (are [form] (=? [{:message ":arglists should be a quoted list of vectors [:metabase/check-defmulti-arglists]"}]
                    (lint-defmulti form))
      '(defmulti expand-visualization
         {:arglists '()}
         (fn [card _ _]
           (-> card :visualization first)))
      '(defmulti expand-visualization
         {:arglists ([a])}              ; unquoted
         (fn [card _ _]
           (-> card :visualization first)))
      '(defmulti expand-visualization
         {:arglists '[(a)]}
         (fn [card _ _]
           (-> card :visualization first)))
      '(defmulti expand-visualization
         {:arglists '((a))}
         (fn [card _ _]
           (-> card :visualization first))))))

(deftest ^:parallel defmulti-arglists-with-underscore-args-test
  (testing "arglists, but some symbols are _"
    (are [form] (=? [{:message ":arglists should contain actual arg names, not underscore (unused) symbols [:metabase/check-defmulti-arglists]"}]
                    (lint-defmulti form))
      '(defmulti expand-visualization
         {:arglists '([card _ _])}
         (fn [card _ _]
           (-> card :visualization first)))
      '(defmulti expand-visualization
         {:arglists '([card _bad _arg])}
         (fn [card _ _]
           (-> card :visualization first))))))

(deftest ^:parallel defmulti-arglists-ok-test
  (testing "good"
    (is (= []
           (lint-defmulti '(defmulti expand-visualization
                             {:arglists '([card x y])}
                             (fn [card _ _]
                               (-> card :visualization first))))))))
