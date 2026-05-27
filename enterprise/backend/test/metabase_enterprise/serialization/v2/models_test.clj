(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.models]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.app-db.core :as mdb]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.impersonation.models/keep-me)

(defn- parse-default-value
  "Parse a default value string into a Clojure value.
  Only cares about boolean defaults (TRUE/FALSE/'true'/'false'); returns nil for everything else."
  [default-value]
  (when default-value
    (case (u/upper-case-en default-value)
      ("TRUE" "'TRUE'")   true
      ("FALSE" "'FALSE'") false
      nil)))

(def ^:private datetime? #{"timestamptz"
                           "TIMESTAMP WITH TIME ZONE"
                           "timestamp"})

(deftest ^:parallel every-model-is-supported-test
  (testing "Serialization support\n"
    (testing "We know about every model"
      (let [known-models (set (concat serdes.models/exported-models
                                      serdes.models/inlined-models
                                      serdes.models/excluded-models))]
        (is (= (set known-models)
               (set (map name (v2.entity-ids/toucan-models)))))))))

(deftest ^:parallel every-model-is-supported-test-2
  (testing "Serialization support\n"
    (let [should-have-entity-id (set (concat serdes.models/data-model serdes.models/content))
          excluded              (set serdes.models/excluded-models)]
      (doseq [model (v2.entity-ids/toucan-models)]
        (let [custom-entity-id?   (not= (get-method serdes/entity-id (name model))
                                        (get-method serdes/entity-id :default))
              custom-hash-fields? (not= (get-method serdes/hash-fields model)
                                        (get-method serdes/hash-fields :default))
              random-entity-id?   (and custom-hash-fields?
                                       (serdes.backfill/has-entity-id? model))]
          ;; we're not checking inline-models for anything here, since some of them have (and use) entity_id, like
          ;; dashcards, and some (ParameterCard) do not
          (when (contains? should-have-entity-id (name model))
            (testing (str "Model should either have entity_id or a hash key: " (name model))
              ;; `not=` is effectively `xor`
              (is (not= custom-entity-id? random-entity-id?))))
          (when (contains? excluded (name model))
            (testing (str "Model shouldn't have entity_id defined: " (name model))
              (is (not custom-entity-id?))
              ;; TODO: strip serialization stuff off Pulse*
              (when-not (#{"Pulse" "PulseChannel" "PulseCard" "User" "PermissionsGroup"} (name model))
                (is (not random-entity-id?))))))))))

(deftest serialization-complete-spec-test
  (mt/with-empty-h2-app-db!
    ;; When serialization spec is defined, it describes every column
    (doseq [m    (-> (methods serdes/make-spec)
                     (dissoc :default)
                     keys)
            :let [spec (serdes/make-spec m nil)]]
      (testing (format "-------- %s\n" m)
        (let [t      (t2/table-name (keyword "model" m))
              fields (u.conn/app-db-column-types (mdb/app-db) t)
              spec'  (-> (merge (zipmap (:copy spec) (repeat :copy))
                                (zipmap (:skip spec) (repeat :skip))
                                (zipmap [:id :updated_at] (repeat :skip)) ; always skipped
                                (:transform spec))
                         ;; `nil`s are mostly fields which differ on `opts`
                         (dissoc nil))]
          (testing "No duplicates in serialization spec\n"
            (are [x y] (empty? (set/intersection (set x) (set y)))
              (:copy spec) (:skip spec)
              (:copy spec) (keys (:transform spec))
              (:skip spec) (keys (:transform spec))))
          (testing "Every column should be declared in serialization spec"
            (let [specs (->> (keys spec')
                             (map name)
                             set)
                  fields (->> (keys fields)
                              (map u/lower-case-en)
                              set)]
              (is (set/subset? fields specs)
                  (format "Missing specs: %s" (pr-str (set/difference fields specs))))))
          (testing "Foreign keys should be declared as such\n"
            (doseq [[fk _] (filter #(:fk (second %)) fields)
                    :let   [fk        (u/lower-case-en fk)
                            transform (get spec' (keyword fk))]
                    :when  (not= transform :skip)]
              (testing (format "`%s.%s` is foreign key which is handled correctly" m fk)
                ;; uses `(serdes/fk ...)` function
                (is (::serdes/fk transform)))))
          (testing "created_at should be one of known timestamp types so we can catch others"
            (when-let [field-def (or (get fields "created_at")
                                     (get fields "CREATED_AT"))]
              (is (contains? datetime? (:type field-def)))))
          (testing "Datetime fields should be declared as such\n"
            (doseq [[dt _] (filter #(datetime? (:type (second %))) fields)
                    :let   [dt        (u/lower-case-en dt)
                            transform (get spec' (keyword dt))]
                    :when  (not= transform :skip)]
              (testing (format "`%s.%s` is datetime field which is handled correctly" m dt)
                (is (= (serdes/date) transform)))))
          (testing "Nested models should declare `parent-ref`\n"
            (doseq [[_nested transform] (filter #(::serdes/nested (second %)) spec')
                    :let                [{:keys [model backward-fk]} transform
                                         inner-spec (serdes/make-spec (name model) nil)]]
              (testing (format "%s has %s declared as `parent-ref`" model backward-fk)
                (is (= (serdes/parent-ref)
                       (get-in inner-spec [:transform backward-fk]))))))
          (testing ":defaults match actual DB field defaults"
            (let [serialized-fields (set (concat (:copy spec) (keys (:transform spec))))
                  declared-defaults (or (:defaults spec) {})]
              ;; Every DB field with a boolean default that is serialized should be in :defaults
              (doseq [[field-name field] fields
                      :let [field-kw   (keyword (u/lower-case-en field-name))
                            db-default (some-> field :default parse-default-value)]
                      :when (and (some? db-default)
                                 (contains? serialized-fields field-kw))]
                (testing (format "`%s.%s` has DB default %s" m (name field-kw) (pr-str db-default))
                  (is (contains? declared-defaults field-kw))
                  (is (= db-default (get declared-defaults field-kw)))))
              ;; Every entry in :defaults should reference a serialized field
              (doseq [field-kw (keys declared-defaults)]
                (testing (format "`%s.%s` in :defaults is a serialized field" m (name field-kw))
                  (is (contains? serialized-fields field-kw)))))))))))

(def ^:private auto-synthesized-fk-targets
  "FK target models whose importers auto-create a stub entity if the target is missing, so
  they don't have to be declared in `serdes/dependencies`. Everything else MUST be declared
  — otherwise `*import-fk*` throws \"Could not find foreign key target\" and aborts the
  whole import (see GDGT-2444 for an example)."
  #{:model/User :model/Table :model/Field})

(def ^:private fk-completeness-known-exceptions
  "`[model field]` pairs that look like FK-completeness violations but are intentionally
  exempt. The map value is a human reason kept for grep-ability."
  {["Database" :router_database_id]
   "router_database_id rows are filtered out of `extract-query` (router DBs aren't serialized), so this FK never reaches the load path."})

(defn- inlined-via-nested?
  "True if `model-name` is loaded only as a nested child of some parent, never as a root.
  Such models override `serdes/generate-path` to return nil so the extract pipeline skips
  them as top-level entities, and their FKs are handled by the parent's `dependencies`."
  [model-name]
  (nil? (serdes/generate-path model-name {:entity_id "probe" :name "probe"})))

(defn- direct-fks
  "Return a seq of `[field target-model]` for every entry in `transform-spec` that is a
  plain `(serdes/fk ...)` declaration whose target needs a `dependencies` entry. Nested
  child specs are NOT walked — their FKs flow through the parent's bespoke `dependencies`
  method which knows how to dig into the nested data, and verifying that takes a
  parent-by-parent treatment that's out of scope here."
  [transform-spec]
  (for [[field transform] transform-spec
        :when             (and (map? transform)
                               (::serdes/fk transform)
                               (not (::serdes/nested transform)))
        :let              [target (::serdes/fk-model transform)]
        :when             (and target
                               (not (auto-synthesized-fk-targets target)))]
    [field target]))

(deftest ^:parallel serialization-direct-fk-dependencies-completeness-test
  (testing (str "Every direct FK declared via `(serdes/fk ...)` in a loadable (non-inlined) "
                "model's `make-spec` is surfaced in that model's `serdes/dependencies` — "
                "otherwise `*import-fk*` will throw \"Could not find foreign key target\" at "
                "import time (see GDGT-2444).")
    (let [inlined? (set serdes.models/inlined-models)]
      (doseq [m (-> (methods serdes/make-spec) (dissoc :default) keys)
              ;; Inlined children are loaded inside their parent, so the FK-resolution
              ;; check applies to the parent's `dependencies`, not theirs. Skipped either
              ;; via the explicit list in `serdes.models/inlined-models` or by detecting a
              ;; nil `generate-path` (the convention for nested-only models like
              ;; QueryAction / HTTPAction / ImplicitAction).
              :when (not (or (inlined? m) (inlined-via-nested? m)))
              :let [fks (->> (:transform (serdes/make-spec m nil))
                             direct-fks
                             (remove (fn [[field _]]
                                       (contains? fk-completeness-known-exceptions [m field]))))]
              :when (seq fks)]
        (testing (format "%s\n" m)
          (let [entity     (into {:serdes/meta [{:model m :id "self"}]}
                                 (for [[field _] fks]
                                   [field (str "fake-eid-" (name field))]))
                deps       (set (serdes/dependencies entity))
                dep-models (set (keep (comp :model peek) deps))]
            (doseq [[field target] fks]
              (testing (format "FK `%s` -> `%s` must appear in `(serdes/dependencies)`"
                               field target)
                (is (contains? dep-models (name target))
                    (format (str "`(serdes/dependencies %s)` did not include a `%s` entry "
                                 "when `%s` was populated. Add the FK to the model's "
                                 "`dependencies` method (see Table/Transform for an example).")
                            m (name target) field))))))))))
