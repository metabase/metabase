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
