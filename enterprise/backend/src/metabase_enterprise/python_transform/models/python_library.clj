(ns metabase-enterprise.python-transform.models.python-library
  (:require
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

(doseq [trait [:metabase/model :hook/timestamped?]]
  (derive :model/PythonLibrary trait))

(def ^:private allowed-paths
  "Set of allowed library paths. Currently only 'common' is supported."
  #{"common"})

(defn- validate-path!
  "Validates that the given path is allowed. Throws an exception if not."
  [path]
  (when-not (contains? allowed-paths path)
    (throw (ex-info (tru "Invalid library path. Only ''common'' is currently supported.")
                    {:status-code 400
                     :path path
                     :allowed-paths allowed-paths}))))

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (validate-path! path)
  (t2/select-one :model/PythonLibrary :path path))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (validate-path! path)
  (t2/with-transaction [_conn]
    (if-let [existing (t2/select-one :model/PythonLibrary :path path)]
      (do
        (t2/update! :model/PythonLibrary (:id existing) {:source source})
        (t2/select-one :model/PythonLibrary (:id existing)))
      (try
        (t2/insert-returning-instance! :model/PythonLibrary {:path path :source source})
        ;; Handle race condition where another process inserted between select and insert
        (catch Exception _e
          (when-let [existing (t2/select-one :model/PythonLibrary :path path)]
            (t2/update! :model/PythonLibrary (:id existing) {:source source})
            (t2/select-one :model/PythonLibrary (:id existing))))))))
