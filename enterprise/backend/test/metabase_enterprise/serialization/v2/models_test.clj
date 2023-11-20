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

    (let [should-have-entity-id (set (concat serdes.models/data-model serdes.models/content))]
      (doseq [model (v2.entity-ids/toucan-models)]
        (let [custom-entity-id?   (not= (get-method serdes/entity-id (name model))
                                        (get-method serdes/entity-id :default))
              custom-hash-fields? (not= (get-method serdes/hash-fields model)
                                        (get-method serdes/hash-fields :default))
              random-entity-id?   (and custom-hash-fields?
                                       (serdes.backfill/has-entity-id? model))]
          (if (contains? should-have-entity-id (name model))
            (testing (str "Model either has entity_id or a hash key: " (name model))
              ;; `not=` is effectively `xor`
              (is (not= custom-entity-id? random-entity-id?)))
            (testing (str "Model shouldn't have entity_id defined: " (name model))
              ;; we're not checking for `random-entity-id?` here, since some inline models (like dashcards) need
              ;; entity_id to sync
              (is (not custom-entity-id?)))))))))
