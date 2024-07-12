(ns metabase.native-query-analyzer.impl
  (:require
   [metabase.driver :as driver]))

;; NOTE: In the future we should replace [[considered-drivers]] and [[macaw-options]] with (a) driver method(s),
;; but given that the interface with Macaw is still in a state of flux, and how simple the current configuration is,
;; we defer extending the public interface and define the logic locally instead. Macaw itself is not battle tested
;; outside this same narrow range of databases in any case.

(def ^:private considered-drivers
  "Since we are unable to ask basic questions of the driver hierarchy outside of that module, we need to explicitly
  mention all sub-types. This is probably not a bad thing."
  #{:mysql :sqlserver :h2 :sqlite :postgres :redshift})

(defn macaw-options
  "Generate the options expected by Macaw based on the nature of the given driver."
  [driver]
  ;; If this isn't a driver we've considered, fallback to Macaw's conservative defaults.
  (when (contains? considered-drivers driver)
    ;; According to the SQL-92 specification, non-quoted identifiers should be case-insensitive, and the majority of
    ;; engines are implemented this way.
    ;;
    ;; In practice there are exceptions, notably MySQL and SQL Server, where case sensitivity is a property of the
    ;; underlying resource referenced by the identifier, and the case-sensitivity does not depend on whether the
    ;; reference is quoted.
    ;;
    ;; For MySQL the case sensitivity of databases and tables depends on both the underlying file system, and a system
    ;; variable used to initialize the database. For SQL Server it depends on the collation settings of the collection
    ;; where the corresponding schema element is defined.
    ;;
    ;; For MySQL, columns and aliases can never be case-sensitive, and for SQL Server the default collation is case-
    ;; insensitive too, so it makes sense to just treat all databases as case-insensitive as a whole.
    ;;
    ;; In future, Macaw may support discriminating on the identifier type, in which case we could be more precise for
    ;; these databases. Being 100% correct would require querying system variables and schema configuration however,
    ;; which is likely a step too far in complexity.
    ;;
    ;; Currently, we go with :agnostic, as it is the most relaxed semantics (the case of both the identifiers and the
    ;; underlying schema is totally ignored, and correspondence is non-deterministic), but Macaw supports more nuanced
    ;; :lower and :upper configuration values which coerce the query identifiers to a given case then do an exact
    ;; comparison with the schema.
    {:case-insensitive      :agnostic
     ;; For both MySQL and SQL Server, whether identifiers are case-sensitive depends on database configuration only,
     ;; and quoting has no effect on this, so we disable this option for consistency with `:case-insensitive`.
     :quotes-preserve-case? (not (contains? #{:mysql :sqlserver} driver))
     :features              {:postgres-syntax        (isa? driver/hierarchy driver :postgres)
                             :square-bracket-quotes  (= :sqlserver driver)
                             :unsupported-statements true
                             :backslash-escape-char  true
                             ;; This will slow things down, but until we measure the difference, opt for correctness.
                             :complex-parsing        true}
     ;; 10 seconds
     :timout                10000
     ;; There is no plan to be exhaustive yet.
     ;; Note that while an allowed list would be more conservative, at the time of writing only 2 of the bundled
     ;; drivers use FINAL as a reserved word, and mentioning them all would be prohibitive.
     ;; In the future, we will use multimethods to define this explicitly per driver, or even discover it automatically
     ;; through the JDBC connection, where possible.
     :non-reserved-words    (vec (remove nil? [(when-not (contains? #{:snowflake :oracle} driver)
                                                 :final)]))}))
