(ns metabase.permissions.query
  (:require
   [metabase.api.common :as api]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.permissions.models.query.permissions :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn check-run-permissions-for-query
  "Make sure the Current User has the appropriate permissions to run `query`. We don't want Users saving Cards with
  queries they wouldn't be allowed to run!"
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   preprocess-fn     :- ::query-perms/preprocess-fn
   query             :- ::query-perms/any-query]
  {:pre [(map? query)]}
  (when-not (query-perms/can-run-query? metadata-provider preprocess-fn query)
    (let [required-perms (try
                           (query-perms/required-perms-for-query metadata-provider preprocess-fn query :throw-exceptions? true)
                           (catch Throwable e
                             e))]
      (throw (ex-info (tru "You cannot save this Question because you do not have permissions to run its query.")
                      {:status-code    403
                       :query          query
                       :required-perms (if (instance? Throwable required-perms)
                                         :error
                                         required-perms)
                       :actual-perms   @api/*current-user-permissions-set*}
                      (when (instance? Throwable required-perms)
                        required-perms))))))
