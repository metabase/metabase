(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]))

(defmethod transforms.i/target-db-id :python
  [transform]
  (-> transform :target :database))

(defmethod transforms.i/source-db-id :python
  [transform]
  (-> transform :source :source-database))


#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :python
  [transform options]
  (transforms-python.execute/execute-python-transform! transform options))

(defn- source-table-value->dependency
  "Convert a source table value (int or ref map) to a dependency map."
  [v]
  (cond
    ;; Integer table ID - direct table dependency
    (int? v)
    {:table v}

    ;; Map with resolved table_id - direct table dependency
    (:table_id v)
    {:table (:table_id v)}

    ;; Map without table_id - return ref for ordering system to resolve
    :else
    {:table-ref (select-keys v [:database_id :schema :table])}))

(defmethod transforms.i/table-dependencies :python
  [transform]
  (into #{}
        (map source-table-value->dependency)
        (vals (get-in transform [:source :source-tables]))))
