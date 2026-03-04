(ns metabase-enterprise.transforms-python.impl
  (:require
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase.transforms.interface :as transforms.i]))

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod transforms.i/execute! :python
  [transform options]
  (transforms-python.execute/execute-python-transform! transform options))
