(ns metabase.serialization.entity-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]))

(deftest restore-identity-test
  (testing "identity columns that only a full `serdes/meta` path holds come from that path"
    (are [model path expected]
         (= expected (serialization/key-of
                      (serialization/restore-identity
                       {:serdes/meta (conj (mapv (fn [[m id]] {:model m :id id}) path) {:model model :id "1"})})))
      "FieldUserSettings" [["Database" "db"] ["Schema" "PUBLIC"] ["Table" "t"] ["Field" "f"]]
      [:model/FieldUserSettings ["db" "PUBLIC" "t" "f"]]

      "TableUserSettings" [["Database" "db"] ["Table" "t"]]
      [:model/TableUserSettings ["db" nil "t"]]

      "OsiAiContext"      [["Database" "db"] ["Schema" "PUBLIC"] ["Table" "t"]]
      [:model/OsiAiContext ["table" ["db" "PUBLIC" "t"]]]

      "OsiAiContext"      [["Card" "Card1AAAAAAAAAAAAAAAA"]]
      [:model/OsiAiContext ["card" "Card1AAAAAAAAAAAAAAAA"]]))
  (testing "identity columns a file has stay as they are"
    (let [entity {:serdes/meta [{:model "Database" :id "db"} {:model "Table" :id "t"} {:model "TableUserSettings" :id "1"}]
                  :table_id    ["other" nil "t"]}]
      (is (= entity (serialization/restore-identity entity)))))
  (testing "file whose `serdes/meta` names only its model is unchanged"
    (let [entity {:serdes/meta [{:model "FieldValues"}] :type "full"}]
      (is (= entity (serialization/restore-identity entity))))))
