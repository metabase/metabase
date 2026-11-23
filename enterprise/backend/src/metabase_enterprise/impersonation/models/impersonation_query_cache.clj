(ns metabase-enterprise.impersonation.models.impersonation-query-cache
  "Model definition for ImpersonationQueryCaches, the cached validation results of native query stages run on
  impersonated databases."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ImpersonationQueryCache [_model] :impersonation_query_cache)

(doto :model/ImpersonationQueryCache
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/ImpersonationQueryCache
  {:input_engine mi/transform-keyword
   :result       mi/transform-keyword})

(mu/defn query-hash :- :string
  "The SHA-256 hex of the native SQL `query`, which looks an ImpersonationQueryCache up."
  [query :- :string]
  (codecs/bytes->hex (buddy-hash/sha256 ^String query)))

(mu/defn lookup :- ::impersonation.schema/impersonation-query-cache.lookup
  "The lookup key of the ImpersonationQueryCache of `input`: the hash of its native query and the inputs it was
  validated with."
  [{:keys [input_query input_engine input_allow_write input_admin input_version]}
   :- ::impersonation.schema/impersonation-query-cache.create]
  {:input_query_hash  (query-hash input_query)
   :input_engine      input_engine
   :input_allow_write input_allow_write
   :input_admin       input_admin
   :input_version     input_version})

(t2/define-before-insert :model/ImpersonationQueryCache
  [row]
  (assoc row :input_query_hash (query-hash (:input_query row))))

(t2/define-before-update :model/ImpersonationQueryCache
  [row]
  (let [changes (t2/changes row)]
    (cond-> row
      (contains? changes :input_query) (assoc :input_query_hash (query-hash (:input_query changes))))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn upsert-impersonation-query-cache! :- ms/PositiveInt
  "Store `row` as the ImpersonationQueryCache of its lookup key, replacing the one stored under that key."
  [row :- ::impersonation.schema/impersonation-query-cache.create]
  (impersonation.db/update-or-insert-query-cache! (lookup row) row))

(mu/defn delete-impersonation-query-caches! :- :nil
  "Delete the ImpersonationQueryCaches with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/ImpersonationQueryCache ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ImpersonationQueryCache [_model]
  {:skip? true})
