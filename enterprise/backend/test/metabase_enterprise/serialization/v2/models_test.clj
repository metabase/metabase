(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.db :as mdb]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [toucan2.core :as t2]))

(deftest ^:parallel every-model-is-supported-test
  (testing "Serialization support\n"
    (testing "We know about every model"
      (let [known-models (set (concat serdes.models/exported-models
                                      serdes.models/inlined-models
                                      serdes.models/excluded-models))]
        (doseq [model (v2.entity-ids/toucan-models)]
          (testing model
            (is (contains? known-models (name model)))))))))

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
    (doseq [m     serdes.models/exported-models
            :let  [spec (serdes/make-spec m)]
            :when spec]
      (let [t      (t2/table-name (keyword "model" m))
            fields (u.conn/app-db-column-types (mdb/app-db) t)
            spec'  (merge (zipmap (:copy spec) (repeat :copy))
                          (zipmap (:skip spec) (repeat :skip))
                          (:transform spec))]
        (testing (format "%s should declare every column in serialization spec" m)
          (is (= (->> (keys fields)
                      (map u/lower-case-en)
                      set)
                 (->> (keys spec')
                      (map name)
                      set))))
        (testing "Foreign keys should be declared as such\n"
          (doseq [[fk _] (filter #(:fk (second %)) fields)
                  :let   [fk (u/lower-case-en fk)
                          action (get spec' (keyword fk))]]
            (testing (format "%s.%s is foreign key which is handled correctly" m fk)
              ;; FIXME: serialization can guess where FK points by itself, but `collection_id`,
              ;; `database_id`, and `source_card_id` are specifying that themselves right now
              (when-not (#{"collection_id" "database_id" "source_card_id"} fk)
                (is (#{:skip
                       serdes/*export-fk*
                       serdes/*export-fk-keyed*
                       serdes/*export-table-fk*
                       serdes/*export-user*}
                     (if (vector? action)
                       (first action) ;; tuple of [ser des]
                       action)))))))))))
