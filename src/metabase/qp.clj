(ns metabase.qp
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.qp.compile :as qp.compile]
   [metabase.qp.execute :as qp.execute]
   [metabase.qp.metadata-provider :as qp.metadata-provider]
   [metabase.qp.postprocess :as qp.postprocess]
   [metabase.qp.preprocess :as qp.preprocess]))

;; FIXME
(defn- metadata-provider [query]
  (or (:lib/metadata query)
      ;; TODO -- needs to handle not-normalized queries, and queries using the Saved Questions ID
      (:database query)))

(defn process-query
  ([query]
   (process-query query conj))

  ([query rf]
   (process-query (metadata-provider query) query rf))

  ([database-id-or-metadata-provider query rf]
   (qp.metadata-provider/ensure-metadata-provider database-id-or-metadata-provider
     (let [query    (qp.preprocess/preprocess query)
           metadata (-> (lib.metadata.calculation/returned-columns query)
                        (qp.preprocess/metadata query))
           compiled (qp.compile/compile query)]
       (transduce
        (qp.postprocess/xform query metadata)
        rf
        (qp.execute/reducible-results compiled))))))

(defn preprocess
  ([query]
   (preprocess (metadata-provider query) query))

  ([database-id-or-metadata-provider query]
   (qp.metadata-provider/ensure-metadata-provider database-id-or-metadata-provider
     (qp.preprocess/preprocess query))))

(defn metadata
  ([query]
   (metadata (metadata-provider query) query))

  ([database-id-or-metadata-provider query]
   (qp.metadata-provider/ensure-metadata-provider database-id-or-metadata-provider
     (let [query (qp.preprocess/preprocess query)]
       (-> (lib.metadata.calculation/metadata query)
           (qp.preprocess/metadata query))))))

(defn compile
  ([query]
   (compile (metadata-provider query) query))

  ([database-id-or-metadata-provider query]
   (qp.metadata-provider/ensure-metadata-provider database-id-or-metadata-provider
     (-> query qp.preprocess/preprocess qp.compile/compile))))
