(ns metabase.search.test-util
  (:require
   [clojure.test :refer :all]
   ;; For now, this is specialized to postgres, but we should be able to abstract it to all index-based engines.
   [metabase.api.common :as api]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search :as search]
   [metabase.search.api :as search.api]
   [metabase.search.config :as search.config]
   [metabase.search.impl :as search.impl]
   [metabase.search.postgres.index :as search.index]
   [metabase.search.test-util :as search.tu]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:dynamic *user-ctx* nil)

#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
(defmacro with-temp-index-table
  "Create a temporary index table for the duration of the body."
  [& body]
  `(when (search/supports-index?)
     (let [table-name# (search.index/random-table-name)]
       (binding [search.index/*active-table* table-name#]
         (try
           (search.index/create-table! search.index/*active-table*)
           ~@body
           (finally
             (#'search.index/drop-table! search.index/*active-table*)))))))

(defmacro with-api-user [raw-ctx & body]
  `(let [raw-ctx# ~raw-ctx]
     (if-let [user-id# (:current-user-id raw-ctx#)]
       ;; for brevity in some tests, we don't require that the user really exists
       (if (t2/exists? :model/User user-id#)
         (mw.session/with-current-user user-id# ~@body)
         (binding [*user-ctx* (merge {:current-user-id       user-id#
                                      :current-user-perms    #{"/"}
                                      :is-superuser?         true
                                      :is-sandboxed-user?    false
                                      :is-impersonated-user? false}
                                     (select-keys raw-ctx# [:current-user-perms
                                                            :is-superuser?
                                                            :is-sandboxed-user?
                                                            :is-impersonated-user?]))]
           ~@body))
       (mt/with-test-user :crowberto ~@body))))

(defn search-results
  "Perform search with the given search-string."
  ([search-string]
   (search-results search-string {}))
  ([search-string raw-ctx]
   (with-api-user raw-ctx
     (let [search-ctx (search.impl/search-context
                       (merge
                        (or *user-ctx*
                            {:current-user-id       api/*current-user-id*
                             :current-user-perms    @api/*current-user-permissions-set*
                             :is-superuser?         api/*is-superuser?*
                             :is-impersonated-user? (premium-features/impersonated-user?)
                             :is-sandboxed-user?    (premium-features/impersonated-user?)})
                        {:archived         false
                         :context          :default
                         :search-string    search-string
                         :models           search.config/all-models
                         :model-ancestors? false}
                        raw-ctx))]
       (search.api/results search-ctx)))))
