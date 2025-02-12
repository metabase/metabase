(ns hooks.clojure.core-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.test :refer :all]
   [hooks.clojure.core]))

(deftest ^:parallel module-test
  (are [symb expected] (= expected
                          (#'hooks.clojure.core/module symb))
    'metabase.qp.middleware.wow        'qp
    'metabase-enterprise.whatever.core 'enterprise/whatever))

(defn- do-with-findings [thunk]
  (let [findings (atom [])]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (thunk))
    @findings))

(defn- lint-ns [form config]
  (do-with-findings
   #(hooks.clojure.core/lint-ns
     {:node   (hooks/parse-string (binding [*print-meta* true] (pr-str form)))
      :config config})))

(defn- lint-modules [form config]
  (->> (lint-ns form config)
       (filter #(= (:type %) :metabase/modules))))

(deftest ^:parallel module-checker-allowed-modules-test
  (is (=? [{:message "Module task should not be used in the api module. [:metabase/modules api :uses]"
            :type :metabase/modules}]
          (lint-modules
           '(ns metabase.api.search
              (:require
               [metabase.request.core :as request]
               [metabase.task :as task]))
           '{:metabase/modules {api     {:uses #{request}}
                                request {:api #{metabase.request.core}}}}))))

(deftest ^:parallel module-checker-api-namespaces-test
  (is (=? [{:message "Namespace metabase.search.config is not an allowed external API namespace for the search module. [:metabase/modules search :api]"
            :type :metabase/modules}]
          (lint-modules
           '(ns metabase.api.search
              (:require
               [metabase.search.config :as search.config]
               [metabase.search.core :as search]))
           '{:metabase/modules {api    {:uses #{search}}
                                search {:api  #{metabase.search.core}}}}))))

(deftest ^:parallel module-checker-api-namespaces-ignore-test
  (is (empty? (lint-modules
               '(ns metabase.api.search
                  (:require
                   ^{:clj-kondo/ignore [:metabase/modules]}
                   [metabase.search.config :as search.config]
                   [metabase.search.core :as search]))
               '{:metabase/modules {api    {:uses #{search}}
                                    search {:api #{metabase.search.core}}}}))))

(deftest ^:parallel module-checker-enterprise-test
  (is (=? [{:message "Module search should not be used in the enterprise/search module. [:metabase/modules enterprise/search :uses]"
            :type :metabase/modules}]
          (lint-modules
           '(ns metabase-enterprise.search.core
              (:require
               [metabase.search.core :as search]))
           '{:metabase/modules {search {:api #{metabase.search.core}}}}))))

(defn- lint-defmulti! [form]
  (let [findings (atom [])
        node     (hooks/parse-string (pr-str form))]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-defmulti {:node node})
      @findings)))

(deftest ^:parallel defmulti-missing-arglists-test
  (testing "missing arglists"
    (is (=? [{:message "All defmultis should have an attribute map with :arglists metadata. [:metabase/check-defmulti-arglists]"}]
            (lint-defmulti! '(defmulti expand-visualization
                               (fn [card _ _]
                                 (-> card :visualization first))))))))

(deftest ^:parallel defmulti-invalid-arglists-test
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

(deftest ^:parallel defmulti-arglists-with-underscore-args-test
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

(deftest ^:parallel defmulti-arglists-ok-test
  (testing "good"
    (is (= []
           (lint-defmulti! '(defmulti expand-visualization
                              {:arglists '([card x y])}
                              (fn [card _ _]
                                (-> card :visualization first))))))))

(deftest ^:parallel require-newlines-test
  (let [findings (atom [])]
    (with-redefs [hooks/reg-finding! (fn [node]
                                       (swap! findings conj node))]
      (hooks.clojure.core/lint-ns
       {:node     (hooks/parse-string "
(ns metabase.task.cache
  (:require [metabase.task.bunny]
            [metabase.task.rabbit]))")})
      (is (=? [{:message "Put your requires on a newline from the :require keyword [:metabase/require-shape-checker]",
                :type    :metabase/require-shape-checker}]
              @findings)))))
