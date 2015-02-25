(ns metabase.driver.util
  "Utility functions used internally by `metabase.driver`.")

(defn db-dispatch-fn
  "Returns a dispatch fn for multi-methods that keys off of a `Database's` `:engine`.

   The correct driver implementation is loaded dynamically to avoid having to require the files elsewhere in the codebase.
   IMPL-NAMESPACE is the namespace we should load relative to the driver, e.g.

    (defmulti my-multimethod (db-dispatch-fn \"metadata\"))

   Would load `metabase.driver.postgres.metadata` for a `Database` whose `:engine` was `:postgres`."
  [impl-namespace]
  (fn [{:keys [engine]}]
    (require (symbol (str "metabase.driver." engine "." impl-namespace)))
    (keyword engine)))
