(ns dev.security-lint.rules.models
  "Writes into application-database models."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(def ^:private foreign-kinds #{:warehouse :file :external})

(defn- dal-file?
  "Toucan 2 calls are confined to each module's `db` namespace by a linter rule of their own, and those
  functions exist precisely to take a changes map and write it -- flagging a request map there reported 115
  findings, all of the same shape and none of them a defect, and grading by origin reported 126 more: sync
  writing warehouse metadata into a Table, an LLM's messages into a MetabotMessage, each the feature working.
  The API rule is where a request body passed through unnarrowed is caught. In the DAL only a write into a
  [[dev.security-lint.vocabulary/privileged-models]] model is reported: the one place a forwarded map sets a
  permission, a credential or an owner."
  [filename]
  (boolean (re-find #"(/db\.clj$|/app_db/)" filename)))

(defn- target-model
  "The model a Toucan write names, as written: `Card` for `:model/Card`, nil for a computed model."
  [node]
  (let [m (some-> (ast/arg node 0) ast/unmeta)
        m (if (and (ast/vector-node? m) (seq (ast/children m))) (first (ast/children m)) m)]
    (when (and m (ast/keyword-node? m) (= "model" (namespace (n/sexpr m))))
      (name (n/sexpr m)))))

(defrule mass-assignment
  {:name        "Map from across a trust boundary written straight into a model"
   :description (str "A value that came from a request, a document, warehouse metadata or another model's row is "
                     "passed as the changes map, so it sets whatever columns it happens to name -- including "
                     "ones the code never meant to expose, such as ownership, archival or permission columns. "
                     "Warehouse-controlled metadata rewrote admin-only Field columns this way; a revert wrote "
                     "a revision's whole object back, embedding settings and collection included.")
   :remediation (str "Select the permitted keys explicitly before writing, with `select-keys` or a schema, rather "
                     "than passing the map through.")
   ;; A request map outside the data-access layer and a map from outside the instance are errors. A map whose
   ;; values derive from another model's row is a warning: the labels say where the *values* came from, and a
   ;; `changes` map built from a Database row's name is not the row written wholesale, though `(:object
   ;; revision)` is. The reviewer tells them apart; the lint cannot.
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-915"
   ;; config.yml is the operator's file, and writing users and databases wholesale from it is what that
   ;; feature is. Content synced from a git remote is not, and stays: that is remote_sync, and SEC-1002.
   :exempt-files [#"advanced_config/"]
   :triggers    #{toucan2.core/update!
                  toucan2.core/insert!
                  toucan2.core/insert-returning-instance!
                  toucan2.core/insert-returning-instances!
                  toucan2.core/insert-returning-pk!}}
  [{:keys [node filename] :as ctx}]
  (let [changes (last (ast/args node))
        ;; `(t2/insert! :model/Session :id id :user_id user-id)`: columns named one by one, as a map literal does
        kwargs? (some-> (ast/arg node 1) ast/unmeta ast/keyword-node?)]
    ;; A map literal names the columns it sets, and so does `(select-keys m [...])` -- the fix this rule
    ;; recommends. The dangerous shape is a whole map arriving from elsewhere. `select-keys` is deliberately not
    ;; a general sanitizer: its *values* are as tainted as they were, which matters to the injection rules.
    (when (and changes
               (not kwargs?)
               (not (ast/map-node? changes))
               (not= 'select-keys (some-> (ast/head-sym changes) name symbol)))
      (let [os      (into #{} (remove #{:request/untyped :request/structured}) (taint/origins ctx changes))
            target  (target-model node)
            foreign (filter #(contains? foreign-kinds (taint/label-kind %)) os)
            ;; a row of one model written into another: what revert and copy do. A setting is not a row.
            other   (filter #(and (= :app-db (taint/label-kind %)) (namespace %) target
                                  (not= target (name %)) (not= "setting" (name %)))
                            os)
            request (filter #(= :request (taint/label-kind %)) os)
            ;; the any-local policy has no origins to tell apart; every local counts there, outside the DAL
            local   (when (and (contains? os :local) (not (dal-file? filename))) [:local])
            ;; In the data-access layer a document or warehouse map is the feature working -- sync, an import, a
            ;; conversation -- unless the model written decides permissions or holds a secret. A row of one model
            ;; written wholesale into another is reported there too, since revert is a DAL function: the map
            ;; is a row of exactly one other model, `(:object revision)`, not a `changes` parameter whose
            ;; values trace back to five.
            dal?       (dal-file? filename)
            wholesale? (and (= 1 (count (distinct other))) (= (count other) (count os)))]
        (cond
          (and dal? (not (contains? vocab/privileged-models target)) (not wholesale?))
          nil

          (and (seq foreign) (taint/raw-value? ctx changes))
          {:tainted? true
           :message  (str "Model write takes its columns from data that came from outside the instance ("
                          (str/join ", " (sort (map name foreign))) "): " (ast/->str changes))}

          ;; only a map passed as it is, or read straight out of something: a map the code assembled --
          ;; `(assoc base ...)`, `(merge defaults m)` -- names its columns in the assembling
          (and (seq other) (taint/raw-value? ctx changes))
          {:tainted? false
           :message  (str "Model write into " target " takes its columns from a row of "
                          (str/join ", " (sort (map name other))) ": " (ast/->str changes))}

          (and (or (seq request) (seq local)) (not (dal-file? filename)))
          {:tainted? true
           :message  (str "Model write takes its columns from a caller-supplied value: " (ast/->str changes))})))))
