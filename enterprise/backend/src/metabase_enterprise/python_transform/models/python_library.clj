(ns metabase-enterprise.python-transform.models.python-library
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

(defn- normalize-path
  "Ensure the path ends with .py extension."
  [path]
  (if (.endsWith ^String path ".py")
    path
    (str path ".py")))

(t2/define-before-insert :model/PythonLibrary
  [library]
  (update library :path normalize-path))

(t2/define-before-update :model/PythonLibrary
  [library]
  (if (:path library)
    (update library :path normalize-path)
    library))

(doseq [trait [:metabase/model :hook/timestamped?]]
  (derive :model/PythonLibrary trait))

(def ^:private allowed-paths
  "Set of allowed library paths. Currently only 'common' is supported."
  #{"common.py"})

(defn- validate-path!
  "Validates that the given path is allowed. Throws an exception if not."
  [path]
  (let [normalized-path (normalize-path path)]
    (when-not (contains? allowed-paths normalized-path)
      (throw (ex-info (tru "Invalid library path. Only ''common'' is currently supported.")
                      {:status-code 400
                       :path normalized-path
                       :allowed-paths allowed-paths})))))

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (t2/select-one :model/PythonLibrary :path normalized-path)))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (let [id (app-db/update-or-insert! :model/PythonLibrary
                                       {:path normalized-path}
                                       (constantly {:path normalized-path :source source}))]
      (t2/select-one :model/PythonLibrary id))))
