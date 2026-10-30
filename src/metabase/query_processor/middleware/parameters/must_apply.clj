(ns metabase.query-processor.middleware.parameters.must-apply
  "Must-apply parameters are filters the server adds and that must never be skipped, such as sandbox filters and
  locked embedding filters. They carry `:lib/must-apply? true`. Wherever parameter expansion would skip an ordinary
  parameter (no value, no target, nowhere to apply it), it throws for a must-apply one instead."
  (:refer-clojure :exclude [every?])
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [every?]]))

(set! *warn-on-reflection* true)

(defn no-value?
  "True if parameter value `v` is nil, or a sequence of nils: a parameter with no usable value."
  [v]
  (or (nil? v)
      (and (sequential? v)
           (every? nil? v))))

(defn single-value?
  "True if `v` is a single string, number, or boolean. Any other value, like a list or a map, can normalize to `[nil]`,
  which reads as [[no-value?]] and would drop a must-apply filter."
  [v]
  (or (string? v) (number? v) (boolean? v)))

(defn throw-if-must-apply
  "Throw if `param` is a must-apply parameter. Call this wherever a parameter would otherwise be skipped; `reason` says
  why."
  [param reason]
  (when (:lib/must-apply? param)
    (let [param-id (or (:id param) (:name param))]
      (throw (ex-info (tru "Filter `{0}` must be applied, but it could not be: {1}" param-id reason)
                      (m/assoc-some {:type         qp.error-type/invalid-parameter
                                     :parameter-id param-id
                                     ::failure     true
                                     :log/keys     #{:parameter-id :user-id}}
                                    :user-id api/*current-user-id*))))))

(defn with-query-ids
  "Add the card and dashboard ids in query `info` to `e`'s error log line, if `e` is a must-apply failure, so an admin
  can find the card or dashboard to fix. Otherwise return `e` unchanged."
  [^Throwable e info]
  (let [ids (m/assoc-some {}
                          :card-id      (:card-id info)
                          :dashboard-id (:dashboard-id info))]
    (if-not (and (::failure (ex-data e)) (seq ids))
      e
      (doto ^Throwable (ex-info (ex-message e)
                                (-> (ex-data e)
                                    (merge ids)
                                    (update :log/keys into (keys ids)))
                                (ex-cause e))
        (.setStackTrace (.getStackTrace e))))))
