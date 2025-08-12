(ns metabase-enterprise.transforms.test-util
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.random :as u.random]))

(defmacro with-isolated-test-db
  "Transforms are creating new tables all the time; we need to do this in test-unique databases."
  [& body]
  `(data/dataset (update (tx/get-dataset-definition defs/test-data)
                         :database-name
                         #(str % "-" (u.random/random-name)))
     ~@body))

(defn drop-target!
  "Drop transform target `target`. `target` can be a string or a map.  If `target` is a string,
  type :table is assumed."
  [target]
  (let [target (if (map? target)
                 target
                 ;; assume this is just a plain table name
                 {:type :table, :name target})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      (-> (driver/drop-transform-target! driver (mt/db) target)
          u/ignore-exceptions))))

(defn gen-table-name
  "Generate a random table name with prefix `table-name-prefix`."
  [table-name-prefix]
  (if (map? table-name-prefix)
    ;; table-name-prefix is a whole target, randomize the name
    (update table-name-prefix :name gen-table-name)
    (str table-name-prefix \_ (str/replace (str (random-uuid)) \- \_))))

(defmacro with-transform-cleanup!
  "Execute `body`, then delete any new :model/Transform instances and drop tables generated from `table-gens`."
  [table-gens & body]
  (assert (seqable? table-gens) "need a seqable? as table-gens")
  (assert (even? (count table-gens)) "need an even number of forms in table-gens")
  (if-let [[sym prefix & more-gens] (seq table-gens)]
    `(let [target# (gen-table-name ~prefix)
           ~sym target#]
       (try
         (with-transform-cleanup! ~more-gens ~@body)
         (finally
           (drop-target! target#))))
    `(mt/with-model-cleanup [:model/Transform :model/Table]
       ~@body)))
