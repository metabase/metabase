(ns metabase.serialization.extract-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.entity :as serialization.entity]
   [metabase.serialization.extract :as serialization.extract]
   [metabase.serialization.protocol.stub :as protocol.stub]
   [metabase.serialization.resolve :as resolve]))

(defmethod serialization/spec :model/SerdesTestEntity [_]
  {:schema    [:map {:closed true}
               [:serdes/meta :any]
               [:entity_id :string]
               [:name {:optional true} :string]
               [:archived {:optional true} :boolean]
               [:card {:optional true} [:maybe :string]]
               [:secret {:optional true} :string]]
   :copy      [:entity_id :name :archived]
   :skip      []
   :transform {:card_id {:as     :card
                         :export (fn [store _rows ids _] (serialization/column-refs store :model/Card ids))
                         :import (fn [store _entities eids opts]
                                   (serialization/column-ids store :model/Card eids opts))}
               :secret  {:export (fn [_ rows values _]
                                   (mapv (fn [row v] (when (:public row) v)) rows values))
                         :import serialization/import-unchanged}
               :size    {:export serialization/export-unchanged
                         :import serialization/import-unchanged}}
   :defaults  {:archived false}})

(defn- entity [n card-id & {:as extra}]
  (merge {:entity_id (format "%021d" n) :name (str "Entity " n) :archived false :card_id card-id} extra))

(defn- counting-store
  "A store naming Card `n` `card-n` and finding no Card 404, counting its calls in `calls`."
  [calls]
  (protocol.stub/stub-store
   {:calls calls
    :fk    (fn [id _model] (when-not (= id 404) (str "card-" id)))}))

(deftest ^:parallel extract-batch-test
  (testing "exports a batch with one store call, leaving out default values and columns exported as nil"
    (let [calls (atom [])]
      (is (= [{:serdes/meta [{:model "SerdesTestEntity"}]
               :entity_id   (format "%021d" 1)
               :name        "Entity 1"
               :card        "card-7"}
              {:serdes/meta [{:model "SerdesTestEntity"}]
               :entity_id   (format "%021d" 2)
               :name        "Entity 2"
               :archived    true
               :secret      "s"}]
             (serialization.extract/extract-batch :model/SerdesTestEntity (counting-store calls)
                                                  [(entity 1 7 :secret "hidden")
                                                   (entity 2 nil :archived true :secret "s" :public true)])))
      (is (= 1 (count @calls))))))

(deftest ^:parallel extract-batch-isolates-failures-test
  (testing "an entity whose reference has no target fails alone, and the rest of the batch still exports"
    (let [[ok failed] (serialization.extract/extract-batch :model/SerdesTestEntity (counting-store (atom []))
                                                           [(entity 1 7) (entity 2 404 :id 2)])]
      (is (= "card-7" (:card ok)))
      (is (instance? clojure.lang.ExceptionInfo failed))
      (is (=? {:model :model/SerdesTestEntity :id 2} (ex-data failed)))
      (is (resolve/target-not-found? (ex-cause failed))))))

(deftest ^:parallel extract-batch-validates-test
  (testing "an export that does not match the schema of the spec fails"
    (let [[failed] (serialization.extract/extract-batch :model/SerdesTestEntity (counting-store (atom []))
                                                        [(entity 1 7 :size 3)])]
      (is (re-find #"Invalid export of :model/SerdesTestEntity" (ex-message (ex-cause failed)))))))

(deftest ^:parallel deserialize-entities-test
  (testing "deserializes a batch, restoring defaults and renamed keys, and setting missing exported columns to nil"
    (is (= [{:entity_id (format "%021d" 1) :name "Entity 1" :archived false :card_id 7 :size 3 :secret nil}]
           (serialization.entity/deserialize-entities
            :model/SerdesTestEntity
            (protocol.stub/stub-store {:fk (fn [eid _] (parse-long (subs eid 5)))})
            [{:entity_id (format "%021d" 1) :name "Entity 1" :card "card-7" :size 3}]
            {})))))
