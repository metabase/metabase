(ns metabase-enterprise.transforms.test-util
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn drop-target!
  "Drop transform target `target` and clean up its metadata.
   `target` can be a string or a map. If `target` is a string, type :table is assumed."
  [target]
  (let [target (if (map? target)
                 target
                 ;; assume this is just a plain table name
                 {:type :table, :name target})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      ;; Drop the actual table/view from the database
      (-> (driver/drop-transform-target! driver (mt/db) target)
          u/ignore-exceptions)
      ;; Also clean up the Metabase metadata
      (-> (t2/delete! :model/Table :name (:name target) :db_id (:id (mt/db)))
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
    `(mt/with-model-cleanup [:model/Transform]
       ~@body)))
