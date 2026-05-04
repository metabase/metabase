#!/usr/bin/env bb

(ns lint-snowplow-schemas
  "Lint snowplow JSON schemas for two rules igluctl 0.6.0 misses: required properties whose type allows
  `null`, and object schemas with no explicit `additionalProperties`.

  Checks the root schema only — nested object schemas under `properties`, `oneOf`, etc. aren't recursed.
  Use Spectral if you need full coverage; this is a tight gate for the two pitfalls we've actually hit.

  Pre-existing violations are baselined (see `baseline`) so the gate enforces new schemas without forcing
  in-place edits to deployed ones."
  (:require
   [babashka.fs :as fs]
   [cheshire.core :as json]))

(def schemas-root "snowplow/iglu-client-embedded/schemas")

;; Iglu schema files match `<vendor>/<name>/jsonschema/<MAJOR>-<MINOR>-<PATCH>` — filter strictly so
;; stray docs (*.md), editor backups, or .DS_Store can't crash the linter.
(def iglu-path-re #".*/[^/]+/[^/]+/jsonschema/\d+-\d+-\d+$")

;; Known violations grandfathered in. Each entry is {:path :pointer}, so unrelated regressions in
;; the same file still fail. Drop an entry once its schema is bumped to a new version.
(def baseline
  #{{:path "snowplow/iglu-client-embedded/schemas/com.metabase/action/jsonschema/1-0-0"
     :pointer "$.properties.action_id"}
    {:path "snowplow/iglu-client-embedded/schemas/com.metabase/csvupload/jsonschema/1-0-3"
     :pointer "$.properties.generated_columns"}
    {:path "snowplow/iglu-client-embedded/schemas/com.metabase/model/jsonschema/1-0-0"
     :pointer "$.properties.model_id"}
    {:path "snowplow/iglu-client-embedded/schemas/com.metabase/embedded_analytics_js/jsonschema/1-0-0"
     :pointer "$"}
    {:path "snowplow/iglu-client-embedded/schemas/com.metabase/serialization/jsonschema/1-0-0"
     :pointer "$"}
    {:path "snowplow/iglu-client-embedded/schemas/com.metabase/serialization/jsonschema/1-0-1"
     :pointer "$"}})

(defn- schema-files []
  (->> (fs/glob schemas-root "**")
       (map str)
       (filter #(re-matches iglu-path-re %))
       sort))

(defn- has-type? [schema kind]
  (let [t (:type schema)]
    (or (= t kind)
        (and (sequential? t) (some #{kind} t)))))

(defn- nullable-type? [t]
  (or (= t "null")
      (and (sequential? t) (some #{"null"} t))))

(defn- check-schema [path schema]
  (let [missing-additional (when (and (has-type? schema "object")
                                      (not (contains? schema :additionalProperties)))
                             [{:pointer "$"
                               :msg "object schema must explicitly set 'additionalProperties' (true or false)"}])
        required           (set (:required schema))
        nullable-required  (for [[prop {t :type}] (:properties schema)
                                 :when (and (contains? required (name prop))
                                            (nullable-type? t))]
                             {:pointer (str "$.properties." (name prop))
                              :msg (format "required property '%s' has nullable type %s"
                                           (name prop) (pr-str t))})]
    (mapv #(assoc % :path path) (concat missing-additional nullable-required))))

(defn -main [& _]
  (let [files      (schema-files)
        all        (mapcat (fn [path]
                             (try
                               (check-schema path (json/parse-string (slurp path) true))
                               (catch Exception e
                                 ;; :fatal forces the entry past the baseline — a parse failure
                                 ;; should never be silently grandfathered.
                                 [{:path path :pointer "$" :fatal true
                                   :msg (str "unparseable: " (ex-message e))}])))
                           files)
        baselined? #(and (not (:fatal %))
                         (contains? baseline (select-keys % [:path :pointer])))
        {grandfathered true new-problems false} (group-by baselined? all)
        stale      (remove (fn [{:keys [path pointer]}]
                             (some #(and (= path (:path %)) (= pointer (:pointer %))) all))
                           baseline)]
    (doseq [{:keys [path pointer msg]} new-problems]
      (println (format "%s  %s  %s" path pointer msg)))
    (doseq [{:keys [path pointer]} stale]
      (println (format "stale baseline entry — no longer violating: %s  %s" path pointer))
      (println "  ↳ remove this entry from `baseline` in bin/lint-snowplow-schemas.bb"))
    (println)
    (println (format "Linted %d schemas, %d new problem(s), %d grandfathered, %d stale baseline entries"
                     (count files) (count new-problems) (count grandfathered) (count stale)))
    (System/exit (if (or (seq new-problems) (seq stale)) 1 0))))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
