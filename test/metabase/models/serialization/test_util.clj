(ns metabase.models.serialization.test-util
  "Stub serdes resolvers, for tests of the serdes walkers that should not touch the app DB."
  (:require
   [metabase.models.serialization.resolve :as resolve]))

(defn- unstubbed [k]
  (fn [& _]
    (throw (ex-info (str "No stub for " k) {:stub k}))))

(defn- each [f xs]
  (into {} (map (fn [x] [x (f x)])) (distinct xs)))

(defn stub-export-resolver
  "An export resolver answering with the fns of `stubs`: `:fk` of an id and a model, `:fk-keyed` of an id, a model and
  a field, `:database` of a Database id, `:table` of a Table id and `:field` of a Field id."
  [stubs]
  (let [stub #(get stubs % (unstubbed %))]
    (reify resolve/SerdesExportResolver
      (export-fks [_ model ids]
        (each #((stub :fk) % model) ids))
      (export-fks-keyed [_ model field ids]
        (if (and (#{:model/Database 'Database} model) (= field :name) (contains? stubs :database))
          (each (stub :database) ids)
          (each #((stub :fk-keyed) % model field) ids)))
      (export-tables [_ table-ids]
        (each (stub :table) table-ids))
      (export-fields [_ field-ids]
        (each (stub :field) field-ids)))))

(defn stub-import-resolver
  "An import resolver answering with the fns of `stubs`: `:fk` of a portable id and a model, `:fk-keyed` of a value, a
  model and a field, `:user` of an email, `:database` of a Database name, `:table` of a Table path and `:field` of a
  Field path."
  [stubs]
  (let [stub #(get stubs % (unstubbed %))]
    (reify resolve/SerdesImportResolver
      (import-fks       [_ model eids]         (each #((stub :fk) % model) eids))
      (import-fks-keyed [_ model field values] (each #((stub :fk-keyed) % model field) values))
      (import-users     [_ emails]             (each (stub :user) emails))
      (import-databases [_ db-names]           (each (stub :database) db-names))
      (import-tables    [_ paths]              (each (stub :table) paths))
      (import-fields    [_ paths]              (each (stub :field) paths)))))

(defmacro with-stub-resolvers
  "Runs `body` with the serdes resolvers stubbed by the `:export` and `:import` stub maps of `stubs` (see
  [[stub-export-resolver]] and [[stub-import-resolver]])."
  [stubs & body]
  `(let [stubs# ~stubs]
     (binding [resolve/*export-resolver* (stub-export-resolver (:export stubs#))
               resolve/*import-resolver* (stub-import-resolver (:import stubs#))]
       ~@body)))
