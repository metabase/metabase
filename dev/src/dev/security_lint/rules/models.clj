(ns dev.security-lint.rules.models
  "Writes into application-database models."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.toucan :as toucan]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

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

(defrule mass-assignment
  {:name        "Map from across a trust boundary written straight into a model"
   :description (str "A value that came from a request, a document, warehouse metadata or another model's row is "
                     "passed as the changes map, so it sets whatever columns it happens to name -- including "
                     "ones the code never meant to expose, such as ownership, archival or permission columns: "
                     "warehouse-controlled metadata written into a Field row, a revision's whole object written "
                     "back on revert, embedding settings and collection included.")
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
   ;; feature is. Content synced from a git remote is not, and stays: that is remote_sync. The serialization API
   ;; import is superuser-only by design and stays too: the same `load-one!` is reached from the remote-sync job
   ;; with no user at all, and the entry kind is what tells them apart.
   :exempt-files [#"advanced_config/"]
   :triggers    #{toucan2.core/update!
                  toucan2.core/insert!
                  toucan2.core/insert-returning-instance!
                  toucan2.core/insert-returning-instances!
                  toucan2.core/insert-returning-pk!}}
  [{:keys [node filename] :as ctx}]
  (let [changes (last (ast/args node))
        ;; `(t2/insert! :model/Session :id id :user_id user-id)`: columns named one by one, as a map literal does.
        ;; Only an insert: `(t2/update! :model/ApiKey :id id changes)` takes its conditions as keywords and its
        ;; changes map last, and the map is as forwarded as ever.
        kwargs? (and (str/starts-with? (name (ast/head-sym node)) "insert")
                     (some-> (ast/arg node 1) ast/unmeta ast/keyword-node?))]
    ;; A map literal names the columns it sets, and so does `(select-keys m [...])` -- the fix this rule
    ;; recommends. The dangerous shape is a whole map arriving from elsewhere. `select-keys` is deliberately not
    ;; a general sanitizer: its *values* are as tainted as they were, which matters to the injection rules.
    (when (and changes
               (not kwargs?)
               (not (ast/map-node? changes))
               (not= 'select-keys (some-> (ast/head-sym changes) name symbol)))
      (let [target  (toucan/target-model node)
            dal?    (dal-file? filename)
            ;; what every caller handed this parameter: a map literal or a `select-keys` -- keys the code chose
            ;; -- or something opaque. `{k value}` counts as opaque: its one key is a value.
            shape   (taint/shape ctx changes)
            raw?    (taint/raw-value? ctx changes)
            ;; How a write of a map with origins `os` grades, or nil for no finding. Applied to the write's own
            ;; value, or to each call that hands the map over -- graded by what *that* call's argument carried,
            ;; since the parameter holds every caller's values at once.
            classify
            (fn [os]
              (let [os      (into #{} (remove #{:request/untyped :request/structured}) os)
                    foreign (filter #(contains? toucan/foreign-kinds (taint/label-kind %)) os)
                    ;; a row of one model written into another: what revert and copy do. A setting is not a row.
                    other   (filter #(and (= :app-db (taint/label-kind %)) (namespace %) target
                                          (not= target (name %)) (not= "setting" (name %)))
                                    os)
                    request (filter #(= :request (taint/label-kind %)) os)
                    ;; the any-local policy has no origins to tell apart; every local counts there, outside the DAL
                    local   (when (and (contains? os :local) (not dal?)) [:local])
                    ;; A row written wholesale is a row of exactly one other model -- `(:object revision)`, what
                    ;; revert and copy pass along. Values drawn from several -- a group id, a database id and a
                    ;; table id -- are a map somebody assembled, and whoever assembled it chose its columns.
                    one-model? (= 1 (count (distinct other)))
                    ;; In the data-access layer a document or warehouse map is the feature working -- sync, an
                    ;; import, a conversation -- unless the model written decides permissions or holds a secret. A
                    ;; wholesale row is reported there too, since revert is a DAL function; but only when the row
                    ;; is *all* the map is, not a `changes` parameter whose values trace back to five boundaries.
                    wholesale? (and one-model? (= (count other) (count os)))]
                (cond
                  (and dal? (not (contains? vocab/privileged-models target)) (not wholesale?))
                  nil

                  (and (seq foreign) raw?)
                  {:tainted? true
                   :origins  os
                   :phrase   (str "a map from outside the instance ("
                                  (str/join ", " (sort (map name foreign))) ")")
                   :message  (str "Model write takes its columns from data that came from outside the instance ("
                                  (str/join ", " (sort (map name foreign))) "): " (ast/->str changes))}

                  ;; only a map passed as it is, or read straight out of something: a map the code assembled --
                  ;; `(assoc base ...)`, `(merge defaults m)`, what `(build-table-permissions ...)` returns --
                  ;; names its columns in the assembling
                  (and one-model? raw?)
                  {:tainted? false
                   :origins  os
                   :phrase   (str "a row of " (str/join ", " (sort (map name other))))
                   :message  (str "Model write into " target " takes its columns from a row of "
                                  (str/join ", " (sort (map name other))) ": " (ast/->str changes))}

                  (and (or (seq request) (seq local)) (not dal?))
                  {:tainted? true
                   :origins  os
                   :phrase   "a caller-supplied map"
                   :message  (str "Model write takes its columns from a caller-supplied value: "
                                  (ast/->str changes))})))]
        ;; the labels say a value in the map came off a Collection row; the callers say the map's keys were all
        ;; chosen in code -- `{:name n :collection_id (get-collection t)}` -- not mass assignment
        (when-not (and (contains? shape :shape/keyed) (not (contains? shape :shape/opaque)))
          ;; The write is the same however it is called; what makes it a finding is the call that hands it the map,
          ;; and that call is what a fix changes. When the graph knows those calls, report one finding at each
          ;; rather than one at the write: fixing one closes one, and dismissing one covers that call alone. A call
          ;; that only forwards its own parameter is no better a place than the write, so `opaque-feeders` has
          ;; already walked out past those to the calls that build the map. Each is graded by what it handed over;
          ;; one whose argument crossed no boundary the rule minds is no finding.
          (if-let [feeders (seq (taint/opaque-feeders ctx changes))]
            (for [{:keys [pos fq origins]} feeders
                  :let [{:keys [tainted? phrase] :as graded} (classify (or origins (taint/origins ctx changes)))]
                  :when graded]
              {:tainted? tainted?
               :at       pos
               :origins  (into #{} (remove #{:local}) (:origins graded))
               :message  (str "Hands " fq " " phrase "; it is written into " (or target "the application database")
                              ", setting every column the map names")})
            (when-let [{:keys [tainted? message]} (classify (taint/origins ctx changes))]
              {:tainted? tainted? :message message})))))))

(defn- privileged-key? [k]
  (and (ast/keyword-node? k) (contains? vocab/privileged-columns (n/sexpr k))))

(defn- request-value? [ctx node]
  (boolean (some #(= :request (taint/label-kind %)) (taint/origins ctx node))))

(defrule privileged-column-from-request
  {:name        "Privileged column written from a request value"
   :enabled     false
   :description (str "Some columns decide who may see or do what: `public_uuid` and `made_public_by_id` make an "
                     "object anonymous-readable, `enable_embedding` and `embedding_params` publish it to embedding, "
                     "`creator_id` and `is_superuser` are identity. Each has one gated endpoint that may set it. A "
                     "write that takes the column from the request body -- through `select-keys`, or "
                     "`(:public_uuid body)` -- sets it for whoever can call that endpoint, which is how a plain "
                     "editor publishes an object or rewrites its creator.")
   :remediation "Drop the column from what the endpoint accepts; set it only from the endpoint that gates it."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-915"
   :triggers    #{toucan2.core/update! toucan2.core/insert! toucan2.core/insert-returning-instance!
                  toucan2.core/insert-returning-instances! toucan2.core/insert-returning-pk!}}
  [{:keys [node] :as ctx}]
  (let [changes (some-> (last (ast/args node)) ast/unmeta)
        head    (some-> (ast/head-sym changes) name)
        hits    (cond
                  ;; `{:public_uuid (:public_uuid body)}`: the column's value came from the request
                  (ast/map-node? changes)
                  (for [[k v] (ast/map-entries changes)
                        :when (and (privileged-key? (ast/unmeta k)) (request-value? ctx v))]
                    (ast/->str k))

                  ;; `(select-keys body [:name :public_uuid])`: the request's own value, kept by name
                  (and (= "select-keys" head) (request-value? ctx (ast/arg changes 0)))
                  (for [k (some-> (ast/arg changes 1) ast/unmeta ast/children)
                        :when (privileged-key? (ast/unmeta k))]
                    (ast/->str k)))]
    (when (seq hits)
      {:tainted? true
       :message  (str "Privileged column" (when (next hits) "s") " written from the request: " (str/join ", " hits))})))
