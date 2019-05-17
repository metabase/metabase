(ns metabase.cmd.load-from-h2-test
  (:require [expectations :refer [expect]]
            [flatland.ordered.map :as ordered-map]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.cmd.load-from-h2 :as load-from-h2]
            [toucan
             [db :as db]
             [models :as models]]))

;; Make sure load-from-h2 works with or without `file:` prefix
(expect
  {:classname   "org.h2.Driver"
   :subprotocol "h2"
   :subname     "file:/path/to/metabase.db;IFEXISTS=TRUE"
   :type        :h2}
  (#'load-from-h2/h2-details "/path/to/metabase.db"))

(expect
  {:classname "org.h2.Driver"
   :subprotocol "h2"
   :subname     "file:/path/to/metabase.db;IFEXISTS=TRUE"
   :type        :h2}
  (#'load-from-h2/h2-details "file:/path/to/metabase.db"))


;; Check to make sure we're migrating all of our entities.
;; This fetches the `metabase.cmd.load-from-h2/entities` and compares it all existing entities

(defn- migrated-model-names []
  (set (map :name @(resolve 'metabase.cmd.load-from-h2/entities))))

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{"TaskHistory"
    "Query"
    "QueryCache"
    "QueryExecution"})

(defn- all-model-names []
  (set (for [ns       @u/metabase-namespace-symbols
             :when    (or (re-find #"^metabase\.models\." (name ns))
                          (= (name ns) "metabase.db.migrations"))
             :when    (not (re-find #"test" (name ns)))
             [_ varr] (do (require ns)
                          (ns-interns ns))
             :let     [{model-name :name, :as model} (var-get varr)]
             :when    (and (models/model? model)
                           (not (contains? models-to-exclude model-name)))]
         model-name)))

(expect
  (all-model-names)
  (migrated-model-names))

;; make sure `objects->colums+values` properly handles the columns with weird casing: `sizeX` and `sizeY`
(expect
  {:cols ["\"id\"" "\"row\"" "\"sizeX\"" "\"sizeY\""]
   :vals [[281 0 18 9]]}
  (binding [db/*quoting-style* :ansi]
    (-> (#'load-from-h2/objects->colums+values
         ;; using ordered-map so the results will be in a predictable order
         [(ordered-map/ordered-map
           :id    281
           :row   0
           :sizex 18
           :sizey 9)])
        (update :cols vec))))

;; make sure `objects->colums+values` properly de-CLOBs and CLOBs (by calling `u/jdbc-clob->str`)

(defrecord ^:private FakeClob [s])

(expect
  {:cols ["\"created_at\"" "\"description\"" "\"parameter_mappings\"" "\"visualization_settings\""]
   :vals [[#inst "2019-04-05T21:26:39.936-00:00"
           "This is a description"
           []
           {}]]}
  (binding [db/*quoting-style* :ansi]
    (with-redefs [mdb/db-type      (constantly :postgres)
                  u/jdbc-clob->str #(cond-> %
                                      (instance? FakeClob %) :s)]
      (-> (#'load-from-h2/objects->colums+values
           [(ordered-map/ordered-map
             :created_at             #inst "2019-04-05T21:26:39.936000000-00:00"
             :description            (FakeClob. "This is a description")
             :parameter_mappings     []
             :visualization_settings {})])
          (update :cols vec)
          (update :vals vec)))))
