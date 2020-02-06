(ns metabase.query-processor.experimental
  (:require [clojure.core.async :as a]
            [metabase.util :as u]))

(def test-config
  {:throw?  true
   :cancel? false})

(defn driver-execute-query [query respond context]
  (if (:throw? test-config)
    (throw (ex-info "Oops!" {}))
    (respond {:cols [{:name "col 1"}
                     {:name "col 2"}]}
             [[1 2]
              [3 4]])))

(defn pivot [query xformf {:keys [return], :as context}]
  {:pre [(fn? return)]}
  (return query xformf context))

(defn mbql->native [qp]
  (fn [query xformf {:keys [preprocessedf nativef], :as context}]
    (let [query        (cond-> query preprocessedf preprocessedf)
          native-query (cond-> (assoc query :native? true)
                         nativef nativef)]
      (qp native-query xformf context))))

(defn example-async-middleware [qp]
  (fn [query xformf {:keys [canceled-chan raise], :as context}]
    (let [futur (future
                  (try
                    (Thread/sleep 50)
                    (qp query xformf context)
                    (catch Throwable e
                      (println "e:" e)
                      (raise e)
                      )))]
      (a/go
        (when (a/<! canceled-chan)
          (println "<FUTURE CANCEL>")
          (future-cancel futur))))
    nil))

(defn example-context-xform-middleware [qp]
  (fn [query xformf context]
    (qp query xformf (-> (assoc context :extra-key? true)
                         (update :preprocessedf (fn [preprocessedf]
                                                  (fn [query]
                                                    (println "GOT PREPROCESSED QUERY!" query)
                                                    (preprocessedf query))))))))

(defn example-metadata-xform-middleware [qp]
  (fn [query xformf context]
    (qp query xformf (update context :metadataf (fn [metadataf]
                                                  (fn [metadata]
                                                    (let [metadata (metadataf metadata)]
                                                      (update metadata :cols #(for [col %]
                                                                                (assoc col :fancy? true))))))))))

(defn example-query-xform-middleware [qp]
  (fn [query xformf context]
    (qp (assoc query :example-query-xform-middleware? true) xformf context)))

(defn- example-rows-xform-middleware [qp]
  (fn [query xformf context]
    (qp
     query
     (fn example-rows-xform-middleware-xformf [metadata]
       (comp
        (fn example-rows-xform-middleware-xform [rf]
          (fn example-rows-xform-middleware-rf
            ([] (rf))
            ([acc] (rf acc))
            ([acc row] (conj acc (conj row :cool)))))
        (xformf metadata)))
     (update context :metadataf (fn [metadataf]
                                  (fn [metadata]
                                    (metadataf (update metadata :cols conj {:name "Cool col"}))))))))

(def pipeline
  (-> pivot
      mbql->native
      example-async-middleware
      example-context-xform-middleware
      example-metadata-xform-middleware
      example-query-xform-middleware
      example-rows-xform-middleware))

(def default-xformf (constantly identity))

(defn default-respond [metadata reduced-rows]
  (println "reduced:" reduced-rows)
  (assoc-in metadata [:data :rows] reduced-rows))

;; context replaces chans.
(defn default-context []
  {:canceled-chan (a/promise-chan)
   ;; formerly these were all channels, replacing them with fns for convenience.

   ;; function used to execute the query. Don't override this without a good reason
   :executef driver-execute-query

   ;; gets/transforms final native query before handing off to driver for execution
   :nativef identity

   ;; gets/transforms final preprocessed query before converting to native
   :preprocessedf identity

   ;; gets results metadata upon query execution and transforms as needed. (Before it is passed to `xformf`)
   :metadataf identity

   ;; (respond metadata reduced-rows)
   ;; combines the results metadata and reduced rows in to the final result returned by the QP.
   :respond default-respond

   ;; self-explanatory.
   :raise identity

   ;; (continue query xformf context)
   ;; called by the last middleware fn. Equivalent to async ring `respond`
   :continue identity})

;; TODO - consider renaming respond + continue to completion + respond or something like that
;; TODO - should rff and xformf, and "reducef" (transduce) be part of context?

(defn default-rf
  ([] [])
  ([acc] acc)
  ([acc row] (conj acc row)))

(defn default-return [rff]
  (fn default-return*
    [query xformf {:keys [metadataf respond raise executef], :as context}]
    (println "query:" query)                               ; NOCOMMIT
    (println "xformf:" xformf)                             ; NOCOMMIT
    (println "context:\n" (u/pprint-to-str 'blue context)) ; NOCOMMIT
    (executef
     query
     (fn respond* [metadata reducible-rows]
       (let [metadata (cond-> metadata metadataf metadataf)]
         (println "metadata:" metadata)             ; NOCOMMIT
         (println "reducible-rows:" reducible-rows) ; NOCOMMIT
         (try
           (let [xform (xformf metadata)
                 rf    (rff metadata)]
             (println "xform:" xform)     ; NOCOMMIT
             (println "rf:" rf)           ; NOCOMMIT
             (respond
              metadata
              (transduce identity (xform rf) reducible-rows)))
           (catch Throwable e
             (raise e)))))
     context)))

(defn build-qp* [qp]
  (fn qp*
    ([query]
     (qp* query (constantly default-rf) default-xformf (default-context)))

    ([query rff]
     (qp* query rff default-xformf (default-context)))

    ([query rff xformf]
     (qp* query rff xformf (default-context)))

    ([query rff xformf {:keys [canceled-chan respond raise], :as context}]
     {:pre [(fn? respond) (fn? raise) (some? canceled-chan)]}
     (let [result-chan (a/promise-chan)
           respond'    (fn [metadata reduced-rows]
                         (a/>!! result-chan (respond metadata reduced-rows)))
           raise'      (fn [e]
                         (a/>!! result-chan (raise e)))]
       (a/go
         (let [[val port] (a/alts! [result-chan canceled-chan] :priority true)]
           (when (and (= val nil)
                      (= port result-chan))
             (a/>! canceled-chan :cancel))
           (a/close! result-chan)
           (a/close! canceled-chan)))
       (qp query xformf (assoc context
                               :respond respond'
                               :raise raise'
                               :return (default-return rff)))
       result-chan))))

(def qp (build-qp* pipeline))

(defn- x []
  (let [result-chan (qp {:my-query? true})]
    (println "result-chan:" result-chan) ; NOCOMMIT
    (when (:cancel? test-config)
      (a/close! result-chan))
    (let [[val] (a/alts!! [result-chan (a/timeout 1000)])]
      (println "val:" val)              ; NOCOMMIT
      (when (instance? Throwable val)
        (throw val))
      val)))
