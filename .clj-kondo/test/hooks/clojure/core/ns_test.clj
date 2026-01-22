(ns hooks.clojure.core.ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.ns]))

(defn- lint-ns [form config]
  (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.ns/lint-ns {:node   (hooks/parse-string
                                             (binding [*print-meta* true]
                                               (pr-str form)))
                                    :config config})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(defn- lint-modules [form config]
  (lint-ns form (assoc-in config [:linters :metabase/modules :level] :warning)))

(deftest ^:parallel module-checker-allowed-modules-test
  (are [task-namespace] (=? [{:message "Module task should not be used in the api module. [:metabase/modules api :uses]"
                              :type :metabase/modules}]
                            (lint-modules
                             '(ns metabase.api.search
                                (:require
                                 [metabase.request.core :as request]
                                 [task-namespace :as task]))
                             '{:metabase/modules {api     {:uses #{request}}
                                                  request {:api #{metabase.request.core}}}}))
    metabase.task
    metabase.task.core))

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

(deftest ^:parallel module-checker-friends-test
  (is (= []
         (lint-modules
          '(ns metabase.search-rest.api
             (:require
              [metabase.search.config :as search.config]
              [metabase.search.core :as search]))
          '{:metabase/modules {search      {:api     #{metabase.search.core}
                                            :friends #{search-rest}}
                               search-rest {:uses #{search}}}}))))

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

(deftest ^:parallel require-newlines-test
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/require-shape-checker {:level :warnings}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.ns/lint-ns {:node (hooks/parse-string "
(ns metabase.task.cache
  (:require [metabase.task.bunny]
            [metabase.task.rabbit]))")})
    (is (=? [{:message "Put your requires on a newline from the :require keyword [:metabase/require-shape-checker]",
              :type    :metabase/require-shape-checker}]
            @(:findings clj-kondo.impl.utils/*ctx*)))))
