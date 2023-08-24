(ns metabase.lib.test-util.macros
  (:require
   [metabase.lib.test-util.macros.impl :as lib.tu.macros.impl]
   [metabase.test.data.mbql-query-impl :as mbql-query-impl]))

(defn- do-with-bindings [thunk]
  (binding [mbql-query-impl/*id-fn-symb*              'metabase.lib.test-metadata/id
            mbql-query-impl/*field-name-fn-symb*      `lib.tu.macros.impl/field-name
            mbql-query-impl/*field-base-type-fn-symb* `lib.tu.macros.impl/field-base-type]
    (thunk)))

(defmacro $ids
  "MLv2 version of [[metabase.test/$ids]] that uses the [[metabase.lib.test-metadata]] rather than the application
  database."
  {:style/indent :defn}
  ([form]
   `($ids nil ~form))

  ([table-name & body]
   (do-with-bindings #(mbql-query-impl/parse-tokens table-name `(do ~@body)))))

(defmacro mbql-query
  "MLv2 version of [[metabase.test/mbql-query]] that uses the [[metabase.lib.test-metadata]] rather than the application
  database."
  {:style/indent :defn}
  ([table-name]
   `(mbql-query ~table-name {}))

  ([table-name inner-query]
   {:pre [(map? inner-query)]}
   (do-with-bindings
    #(as-> inner-query <>
       (mbql-query-impl/parse-tokens table-name <>)
       (mbql-query-impl/maybe-add-source-table <> table-name)
       (mbql-query-impl/wrap-inner-query <>)))))
