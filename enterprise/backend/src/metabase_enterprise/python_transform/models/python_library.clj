(ns metabase-enterprise.python-transform.models.python-library
  (:require
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

(doseq [trait [:metabase/model :hook/timestamped?]]
  (derive :model/PythonLibrary trait))

(t2/define-before-insert :model/PythonLibrary
  [library]
  (when (t2/exists? :model/PythonLibrary)
    (throw (ex-info (tru "Only one Python library can exist at a time")
                    {:status-code 400})))
  library)

(defn get-python-library
  "Get the Python library."
  []
  (t2/select-one :model/PythonLibrary))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [source]
  (t2/with-transaction [_conn]
    (if-let [existing (t2/select-one :model/PythonLibrary)]
      (do
        (t2/update! :model/PythonLibrary (:id existing) {:source source})
        (t2/select-one :model/PythonLibrary (:id existing)))
      (t2/insert-returning-instance! :model/PythonLibrary {:source source}))))
