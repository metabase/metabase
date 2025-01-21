(ns hooks.clojure.core-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.clojure.core]))

(deftest module-checker-allowed-modules-test
  (let [findings (atom [])]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-ns
       {:node     (hooks/parse-string "
(ns metabase.api.search
  (:require
   [metabase.request.core :as request]
   [metabase.task :as task]))")
        :config '{:linters {:metabase/ns-module-checker {:allowed-modules {metabase.api #{metabase.request}}
                                                         :api-namespaces  {metabase.request #{metabase.request.core}}}}}})
      (is (=? [{:message (str "Module metabase.task should not be used in the metabase.api module."
                              " [:metabase/ns-module-checker :allowed-modules metabase.api]")
                :type :metabase/ns-module-checker}]
              @findings)))))

(deftest module-checker-api-namespaces-test
  (let [findings (atom [])]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-ns
       {:node     (hooks/parse-string "
(ns metabase.api.search
  (:require
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]))")
        :config '{:linters {:metabase/ns-module-checker {:allowed-modules {metabase.api #{metabase.search}}
                                                         :api-namespaces  {metabase.search #{metabase.search.core}}}}}})
      (is (=? [{:message (str "Namespace metabase.search.config is not an allowed external API namespace for the"
                              " metabase.search module. [:metabase/ns-module-checker :api-namespaces metabase.search]")
                :type :metabase/ns-module-checker}]
              @findings)))))

(deftest module-checker-api-namespaces-ignore-test
  (let [findings (atom [])]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-ns
       {:node     (hooks/parse-string "
(ns metabase.api.search
  (:require
   ^{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]))")
        :config '{:linters {:metabase/ns-module-checker {:allowed-modules {metabase.api #{metabase.search}}
                                                         :api-namespaces  {metabase.search #{metabase.search.core}}}}}})
      (is (empty? @findings)))))

(defn- lint-defmulti! [form]
  (let [findings (atom [])
        node     (hooks/parse-string (pr-str form))]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-defmulti {:node node})
      @findings)))

(deftest defmulti-missing-arglists-test
  (testing "missing arglists"
    (is (=? [{:message "All defmultis should have an attribute map with :arglists metadata. [:metabase/check-defmulti-arglists]"}]
            (lint-defmulti! '(defmulti expand-visualization
                               (fn [card _ _]
                                 (-> card :visualization first))))))))

(deftest defmulti-invalid-arglists-test
  (testing "invalid arglists"
    (are [form] (=? [{:message ":arglists should be a quoted list of vectors [:metabase/check-defmulti-arglists]"}]
                    (lint-defmulti! form))
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

(deftest defmulti-arglists-with-underscore-args-test
  (testing "arglists, but some symbols are _"
    (are [form] (=? [{:message ":arglists should contain actual arg names, not underscore (unused) symbols [:metabase/check-defmulti-arglists]"}]
                    (lint-defmulti! form))
      '(defmulti expand-visualization
         {:arglists '([card _ _])}
         (fn [card _ _]
           (-> card :visualization first)))
      '(defmulti expand-visualization
         {:arglists '([card _bad _arg])}
         (fn [card _ _]
           (-> card :visualization first))))))

(deftest defmulti-arglists-ok-test
  (testing "good"
    (is (= []
           (lint-defmulti! '(defmulti expand-visualization
                              {:arglists '([card x y])}
                              (fn [card _ _]
                                (-> card :visualization first))))))))
