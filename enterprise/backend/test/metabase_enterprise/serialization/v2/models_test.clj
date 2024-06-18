(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models.serialization :as serdes]))

(deftest every-model-is-supported-test
  (testing "Serialization support\n"
    (testing "We know about every model"
      (is (= (set (concat serdes.models/exported-models
                          serdes.models/inlined-models
                          serdes.models/excluded-models))
             (set (map name (v2.entity-ids/toucan-models))))))

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
