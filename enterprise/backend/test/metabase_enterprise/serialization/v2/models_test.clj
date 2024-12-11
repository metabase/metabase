(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.connection-impersonation :as conn-imp]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.db :as mdb]
   [metabase.models]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [toucan2.core :as t2]))

(comment
  metabase.models/keep-me
  conn-imp/keep-me)

(def datetime? #{"timestamptz"
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
  (mt/with-empty-h2-app-db
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
                       (get-in inner-spec [:transform backward-fk])))))))))))
