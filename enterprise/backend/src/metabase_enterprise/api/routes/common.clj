(ns metabase-enterprise.api.routes.common
  "Shared stuff used by various EE-only API routes."
  (:require
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util.i18n :as i18n]))

(defn +require-premium-feature
  "Wraps Ring `handler`. Check that we have a premium token with `feature` (a keyword; see [[metabase.public-settings.premium-features]] for a
  current known features) or return a 401 if it is not.

    (context \"/whatever\" [] (+require-premium-feature :sandboxes (deferred-tru \"Sandboxes\") whatever/routes))

  Very important! Make sure you only wrap handlers inside [[compojure.core/context]] forms with this middleware (as in
  example above). Otherwise it can end up causing requests the handler would not have handled anyway to fail.
  Use [[when-premium-feature]] instead if you want the handler to apply if we have the premium feature but pass-thru
  if we do not."
  [feature feature-name handler]
  (assert (i18n/localized-string? feature-name), "`feature-name` must be i18ned")
  (with-meta
   (fn [request respond raise]
     (premium-features/assert-has-feature feature feature-name)
     (handler request respond raise))
   (meta handler)))

(defn ^:deprecated +when-premium-feature
  "Wraps Ring `handler`. Only applies handler if we have a premium token with `feature`; if not, passes thru to the next
  handler.

    (+when-premium-feature :sandboxes (+auth table/routes))

  This is typically used to _replace_ OSS versions of API endpoints with special implementations that live in EE-land.
  If the endpoint **only** exists in EE you should use [[+require-premium-feature]] instead which will give the API
  user a useful error message if the endpoint is not available because they do not have the token feature in
  question, rather than a generic 'endpoint does not exist' 404 error.

  In general, it's probably better NOT to swap out API endpoints, because it's not obvious at all that it happened,
  and it makes it hard for us to nicely structure our contexts in [[metabase-enterprise.api.routes/routes]]. So only
  do this if there's absolutely no other way (which is probably not the case)."
  [feature handler]
  (fn [request respond raise]
    (if-not (premium-features/has-feature? feature)
      (respond nil)
      (handler request respond raise))))
