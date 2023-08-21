(ns metabase.util.methodical.unsorted-dispatcher
  "Workaround for upstream issue https://github.com/camsaul/methodical/issues/97

  Actually a bit of a misnomer since this does still sort dispatch values; it just doesn't complain if any are
  ambiguous."
  (:require
   [methodical.impl.dispatcher.standard]
   [methodical.interface])
  (:import
   (methodical.interface Dispatcher)))

(set! *warn-on-reflection* true)

(comment methodical.interface/keep-me)

(deftype UnsortedDispatcher [dispatch-fn hierarchy-var default-value]
  Dispatcher
  (dispatch-value [_]              (dispatch-fn))
  (dispatch-value [_ a]            (dispatch-fn a))
  (dispatch-value [_ a b]          (dispatch-fn a b))
  (dispatch-value [_ a b c]        (dispatch-fn a b c))
  (dispatch-value [_ a b c d]      (dispatch-fn a b c d))
  (dispatch-value [_ a b c d more] (apply dispatch-fn a b c d more))

  (matching-primary-methods [_this method-table dispatch-value]
    (methodical.impl.dispatcher.standard/matching-primary-methods
     {:hierarchy      (deref hierarchy-var)
      :default-value  default-value
      :method-table   method-table
      :dispatch-value dispatch-value
      :ambiguous-fn   (constantly false)}))

  (matching-aux-methods [_this method-table dispatch-value]
    (methodical.impl.dispatcher.standard/matching-aux-methods
     {:hierarchy      (deref hierarchy-var)
      :default-value  default-value
      :method-table   method-table
      :dispatch-value dispatch-value
      :ambiguous-fn   (constantly false)}))

  (default-dispatch-value [_this]
    default-value)

  (prefers [_]
    nil)

  (with-prefers [this new-prefs]
    (when (seq new-prefs)
      (throw (UnsupportedOperationException. (format "%s does not support preferences." `unsupported-dispatcher))))
    this)

  (dominates? [_this _x _y]
    false))

(defn unsorted-dispatcher
  "This is basically similar the same as the [[methodical.core/standard-dispatcher]], but doesn't complain when dispatch
  values are ambiguous, and doesn't support preferences."
  [dispatch-fn & {:keys [hierarchy default-value]
                  :or   {hierarchy     #'clojure.core/global-hierarchy
                         default-value :default}}]
  {:pre [(ifn? dispatch-fn) (instance? clojure.lang.IDeref hierarchy)]}
  (->UnsortedDispatcher dispatch-fn hierarchy default-value))
