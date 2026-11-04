(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.models]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.app-db.core :as mdb]
   [metabase.models.resolution :as models.resolution]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.impersonation.models/keep-me)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [thunk]
    (doseq [model (keys models.resolution/model->namespace)]
      (t2/resolve-model model))
    (thunk)))

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
               (set (map name (keys models.resolution/model->namespace)))))))))

(deftest ^:parallel timestamps-are-skipped-test
  (testing "No serialized model exports or loads created_at or updated_at, so an entity serializes the same way on every
           instance"
    (doseq [m      (-> (methods serdes/make-spec) (dissoc :default) keys)
            :let   [{:keys [copy skip transform]} (serdes/make-spec m nil)]
            column [:created_at :updated_at]]
      (testing (format "%s.%s" m (name column))
        (is (not (some #{column} copy)))
        (is (not (some #{column} skip)) "always skipped, so leave it out of :skip")
        (is (not (contains? transform column)))))))

(defn- entity-id-collation
  "The collation of `table`'s entity_id column in the schema the `schema-fn` SQL function names."
  [table schema-fn]
  (first (vals (t2/query-one {:select [:collation_name]
                              :from   [:information_schema.columns]
                              :where  [:and
                                       [:= :table_schema [schema-fn]]
                                       [:= :table_name table]
                                       [:= :column_name "entity_id"]]}))))

(deftest entity-id-binary-collation-test
  (testing "entity_id columns compare byte by byte, so every app DB orders exported entities, and names same-named
           files, the same way"
    (when-let [[expected schema-fn] (case (mdb/db-type)
                                      :postgres ["C" :current_schema]
                                      :mysql    ["utf8mb4_bin" :database]
                                      nil)]
      (doseq [model (keys models.resolution/model->namespace)
              :when (isa? model :hook/entity-id)
              :let  [table (name (t2/table-name model))]]
        (testing table
          (is (= expected (entity-id-collation table schema-fn))
              (str "Create the entity_id column with type ${entity_id.type}, and re-state that type in any "
                   "modifyDataType or addNotNullConstraint on it")))))))

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
                                (zipmap [:id :created_at :updated_at] (repeat :skip)) ; always skipped
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
                                         inner-spec (serdes/make-spec (name model) nil)]
                    :when               (not (:delete-children! (:opts transform)))]
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
  they don't have to be declared in `serdes/deserialization-dependencies`. Everything else MUST be declared
  — otherwise `*import-fk*` throws \"Could not find foreign key target\" and aborts the
  whole import (see GDGT-2444 for an example)."
  #{:model/User :model/Database :model/Table :model/Field})

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
                "model's `make-spec` is surfaced in that model's `serdes/deserialization-dependencies` — "
                "otherwise `*import-fk*` will throw \"Could not find foreign key target\" at "
                "import time (see GDGT-2444).")
    (let [inlined? (set serdes.models/inlined-models)]
      (doseq [m (-> (methods serdes/make-spec) (dissoc :default) keys)
              ;; Inlined children are loaded inside their parent, so the FK-resolution
              ;; check applies to the parent's `dependencies`, not theirs. Skipped either
              ;; via the explicit list in `serdes.models/inlined-models` or by detecting a
              ;; nil `generate-path` (the convention for nested-only models like
              ;; QueryAction / ImplicitAction).
              :when (not (or (inlined? m) (inlined-via-nested? m)))
              :let [fks (direct-fks (:transform (serdes/make-spec m nil)))]
              :when (seq fks)]
        (testing (format "%s\n" m)
          (let [entity     (into {:serdes/meta [{:model m :id "self"}]}
                                 (for [[field _] fks]
                                   [field (str "fake-eid-" (name field))]))
                deps       (set (serdes/deserialization-dependencies entity))
                dep-models (set (keep (comp :model peek) deps))]
            (doseq [[field target] fks]
              (testing (format "FK `%s` -> `%s` must appear in `(serdes/deserialization-dependencies)`"
                               field target)
                (is (contains? dep-models (name target))
                    (format (str "`(serdes/deserialization-dependencies %s)` did not include a `%s` entry "
                                 "when `%s` was populated. Add the FK to the model's "
                                 "`dependencies` method (see Table/Transform for an example).")
                            m (name target) field))))))))))
