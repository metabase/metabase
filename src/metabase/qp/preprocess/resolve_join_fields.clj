(ns metabase.qp.preprocess.resolve-join-fields
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]))

(defn- default-join-fields [join context]
  (let [cols (lib.metadata.calculation/returned-columns (:query context) -1 (assoc join :fields :all))]
    (mapv lib.ref/ref cols)))

(defn resolve-join-fields [{:keys [fields], :as join} context]
  (when (keyword? fields)
    (case fields
      :none (dissoc join :fields)
      :all  (assoc join :fields (default-join-fields join context)))))

(defn resolve-join-fields-middleware [what]
  (when (= what :lib.walk/join.post)
    #'resolve-join-fields))
