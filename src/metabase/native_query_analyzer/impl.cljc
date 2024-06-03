(ns metabase.native-query-analyzer.impl)

;; NOTE: In future we would want to replace [[considered-drivers]] and [[macaw-options]] with (a) driver method(s),
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
    ;; For MySQL the case sensitivity of databases and tables depends on both the underlying
    ;; file system, and a system variable used to initialize the database. For SQL Server it depends on the collation
    ;; settings of the collection where the corresponding schema element is defined.
    ;;
    ;; For MySQL, columns and aliases can never be case-sensitive, and for SQL Server the default collation is case-
    ;; insensitive too, so it makes sense to just treat all databases as case-insensitive as a whole.
    ;;
    ;; In future Macaw may support discriminating on the identifier type, in which case we could be more precise for
    ;; these databases. Being 100% correct would require querying system variables and schema configuration however,
    ;; which is likely a step too far in complexity.
    {:case-insensitive?     true
     ;; For both MySQL and SQL Server, whether identifiers are case-sensitive depends on database configuration only,
     ;; and quoting has no effect on this, so we disable this option for consistency with `:case-insensitive?`.
     :quotes-preserve-case? (not (#{:mysql :sqlserver} driver))}))
