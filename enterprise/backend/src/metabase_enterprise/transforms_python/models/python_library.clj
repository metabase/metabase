(ns metabase-enterprise.transforms-python.models.python-library
  (:require
   [clojure.string :as str]
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

(defn- parse-function-arg
  "Parse a single function argument, extracting name and type annotation if present.
   Returns a map with :name and optionally :type."
  [arg-str]
  (let [trimmed (str/trim arg-str)]
    (if (re-find #":" trimmed)
      (let [[name type-annotation] (str/split trimmed #":" 2)]
        {:name (str/trim name)
         :type (str/trim type-annotation)})
      {:name trimmed})))

(defn- parse-function-args
  "Parse function arguments string, handling varargs (*args) and kwargs (**kwargs).
   Returns a vector of argument maps with :name, :type (optional), :varargs? and :kwargs? flags."
  [args-str]
  (if (str/blank? args-str)
    []
    (let [args (str/split args-str #",")]
      (mapv (fn [arg]
              (let [trimmed   (str/trim arg)
                    kwargs?   (str/starts-with? trimmed "**")
                    varargs?  (and (str/starts-with? trimmed "*")
                                   (not kwargs?))
                    clean-arg (cond
                                kwargs? (subs trimmed 2)
                                varargs? (subs trimmed 1)
                                :else trimmed)
                    parsed    (parse-function-arg clean-arg)]
                (cond-> parsed
                  varargs? (assoc :varargs? true)
                  kwargs? (assoc :kwargs? true))))
            args))))

(defn- extract-functions-from-source
  "Extract function definitions from Python source code using regex.
   Returns a vector of maps with :name, :docstring, and :arguments."
  [source]
  (if (str/blank? source)
    []
    (let [;; Regex to match function definitions with optional type annotations and docstrings
          func-pattern (re-pattern
                        (str "(?s)^def\\s+"                    ;; def keyword
                             "([a-zA-Z_][a-zA-Z0-9_]*)"        ;; function name (group 1)
                             "\\s*\\("                          ;; opening parenthesis
                             "([^)]*)"                          ;; arguments (group 2)
                             "\\)"                              ;; closing parenthesis
                             "(?:\\s*->\\s*[^:]+?)?"            ;; optional return type annotation
                             "\\s*:"                            ;; colon
                             "(?:\\s*\\n\\s*\"\"\"(.*?)\"\"\")?")) ;; optional docstring (group 3)
          ]
      (loop [matches (re-seq func-pattern source)
             result []]
        (if (empty? matches)
          result
          (let [[_ func-name args-str docstring] (first matches)
                args (try
                       (parse-function-args args-str)
                       (catch Exception _
                         ;; If parsing fails, fallback to basic info
                         []))
                func-info {:name func-name
                           :arguments args}
                func-info (if (and docstring (not (str/blank? docstring)))
                            (assoc func-info :docstring (str/trim docstring))
                            func-info)]
            (recur (rest matches)
                   (conj result func-info))))))))

(defn get-python-library-completions
  "Get completion information for functions in a Python library by path.
   Returns a vector of function information maps."
  [path]
  (let [library (get-python-library-by-path path)]
    (if library
      (extract-functions-from-source (:source library))
      [])))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (let [id (app-db/update-or-insert! :model/PythonLibrary
                                       {:path normalized-path}
                                       (constantly {:path normalized-path :source source}))]
      (t2/select-one :model/PythonLibrary id))))
