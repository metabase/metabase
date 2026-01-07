(ns mage.openapi
  "OpenAPI specification validation tasks."
  (:require
   [babashka.process :as process]
   [clojure.string :as str]
   [mage.color :as c]))

(defn- run-command
  "Run a command and return {:exit, :out, :err}."
  [& args]
  (let [result (apply process/shell {:out :string :err :string :continue true} args)]
    {:exit (:exit result)
     :out (:out result)
     :err (:err result)}))

(defn validate-openapi
  "Validate the OpenAPI specification using Redocly CLI.

   Options:
   - :file - Path to openapi.json (default: resources/openapi/openapi.json)
   - :strict - If true, fail on any error. If false, skip style rules (default: false)"
  [{:keys [file strict]}]
  (let [file (or file "resources/openapi/openapi.json")
        strict (boolean strict)]
    (println (c/cyan "Validating OpenAPI specification:") file)

    ;; Check if file exists
    (when-not (.exists (java.io.File. file))
      (println (c/red "Error:") "OpenAPI spec file not found:" file)
      (println "Run this first to generate it:")
      (println (c/green "  yarn generate-openapi"))
      (System/exit 1))

    ;; Build command - skip style/legacy rules unless strict mode
    ;; We skip rules for pre-existing issues that aren't critical spec violations
    (let [skip-rules (when-not strict
                       ["--skip-rule" "security-defined"        ; recommendation, not required
                        "--skip-rule" "operation-operationId"   ; recommendation
                        "--skip-rule" "no-unused-components"    ; recommendation
                        "--skip-rule" "info-license"            ; recommendation
                        "--skip-rule" "no-path-trailing-slash"  ; pre-existing, style
                        "--skip-rule" "no-identical-paths"      ; pre-existing, legacy routes
                        "--skip-rule" "no-ambiguous-paths"      ; pre-existing, legacy routes
                        "--skip-rule" "path-parameters-defined" ; pre-existing
                        "--skip-rule" "spec-components-invalid-map-name"]) ; pre-existing, schema names
          cmd (concat ["npx" "--yes" "@redocly/cli@1.34.2" "lint" file]
                      skip-rules)
          _ (println (c/cyan "Running:") (str/join " " cmd))
          result (apply run-command cmd)]

      (println (:out result))
      (when-not (str/blank? (:err result))
        (println (:err result)))

      (if (zero? (:exit result))
        (do
          (println (c/green "✓") "OpenAPI specification is valid")
          true)
        (do
          (println (c/red "✗") "OpenAPI specification has errors")
          (System/exit 1))))))
