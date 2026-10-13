(ns metabase.sql-tools.sqlglot-java.core
  "Registers Java SQLGlot in the existing sql-tools multimethods. Both SQLGlot
  backends share driver/metadata/normalization glue; only the AST shim differs."
  (:require
   [metabase.sql-parsing.parser :as parser]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.sql-tools.sqlglot.core]))

(set! *warn-on-reflection* true)

;; Capture the shared implementations before installing backend-specific wrappers.
;; Keep the incoming parser argument: common's validation/field-resolution pipeline
;; dispatches further operations with it. An explicit :sqlglot call always uses Graal,
;; even when the application-wide setting selects Java.
(doseq [^clojure.lang.MultiFn multimethod
        [sql-tools/returned-columns-impl
         sql-tools/referenced-tables-impl
         sql-tools/referenced-fields-impl
         sql-tools/field-references-impl
         sql-tools/validate-query-impl
         sql-tools/replace-names-impl
         sql-tools/referenced-tables-raw-impl
         sql-tools/simple-query?-impl
         sql-tools/add-into-clause-impl
         sql-tools/transpile-sql-impl]
        :let [method (get-method multimethod :sqlglot)
              implementation (or (::shared-implementation (meta method)) method)]
        [dispatch backend] [[:sqlglot :graalvm] [:sqlglot-java :sqlglot-java]]]
  (.addMethod multimethod dispatch
              (with-meta
               (fn [& args]
                 (binding [parser/*backend* backend]
                   (apply implementation args)))
               {::shared-implementation implementation})))
