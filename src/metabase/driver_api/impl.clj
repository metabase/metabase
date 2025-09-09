(ns metabase.driver-api.impl
  {:clj-kondo/config '{:linters
                       ;; this is actually ok here since this is a drivers namespace
                       {:discouraged-namespace {metabase.query-processor.store {:level :off}}}}}
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

;; replacement for the old `qp.store/cached` macro, deprecated in 57
(defn cached
  "Cache the value of `body` for key(s) for the duration of this QP execution. (Body is only evaluated the once per QP
  run; subsequent calls return the cached result.)

  Note that each use of `cached` generates its own unique first key for cache keyseq; thus while it is not possible to
  share values between multiple `cached` forms, you do not need to worry about conflicts with other places using this
  macro.

    ;; cache lookups of Card.dataset_query
    (driver-api/cached card-id
      (t2/select-one-fn :dataset_query Card :id card-id))"
  {:style/indent 1}
  [k-or-ks & body]
  (let [ks (into [(list 'quote (gensym (str (name (ns-name *ns*)) "/misc-cache-")))] (u/one-or-many k-or-ks))]
    `(lib.metadata/general-cached-value
      (qp.store/metadata-provider)
      ~ks
      (fn [] ~@body))))
