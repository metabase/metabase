(ns metabase-enterprise.serialization.v2.models-test
  (:require
   [clojure.set :as set]
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

(deftest serialization-complete-spec-test
  (mt/with-empty-h2-app-db
    ;; When serialization spec is defined, it describes every column
    (doseq [m    (-> (methods serdes/make-spec)
                     (dissoc :default)
                     keys)
            :let [spec (serdes/make-spec m nil)]]
      (let [t      (t2/table-name (keyword "model" m))
            fields (u.conn/app-db-column-types (mdb/app-db) t)
            spec'  (-> (merge (zipmap (:copy spec) (repeat :copy))
                              (zipmap (:skip spec) (repeat :skip))
                              (zipmap [:id :updated_at] (repeat :skip)) ; always skipped
                              (:transform spec))
                       ;; `nil`s are mostly fields which differ on `opts`
                       (dissoc nil))]
        (testing (format "%s has no duplicates in serialization spec\n" m)
          (are [x y] (empty? (set/intersection (set x) (set y)))
            (:copy spec) (:skip spec)
            (:copy spec) (keys (:transform spec))
            (:skip spec) (keys (:transform spec))))
        (testing (format "%s should declare every column in serialization spec\n" m)
          (is (set/subset?
               (->> (keys fields)
                    (map u/lower-case-en)
                    set)
               (->> (keys spec')
                    (map name)
                    set))))
        (testing "Foreign keys should be declared as such\n"
          (doseq [[fk _] (filter #(:fk (second %)) fields)
                  :let   [fk        (u/lower-case-en fk)
                          transform (get spec' (keyword fk))]
                  :when  (not= transform :skip)]
            (testing (format "%s.%s is foreign key which is handled correctly" m fk)
              ;; uses `(serdes/fk ...)` function
              (is (::serdes/fk transform)))))))))
