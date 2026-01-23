(ns metabase-enterprise.transforms-python.impl
  "Python transform interface implementation for scheduled execution.

   The core interface methods (source-db-id, target-db-id, table-dependencies)
   are implemented in transforms-python.base. This namespace registers the
   scheduled execution method."
  (:require
   ;; Load base implementations - registers source-db-id, target-db-id, table-dependencies, execute-base!
   [metabase-enterprise.transforms-python.base]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms.interface :as transforms.i]))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :python
  [transform options]
  (transforms-python.execute/execute-python-transform! transform options))
