(ns metabase.metabot.tools.test-util
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(defn query=
  "Compare two queries for equality, ignoring lib/uuids."
  [expected actual]
  (= (lib/remove-lib-uuids expected)
     (lib/remove-lib-uuids actual)))

(defn venues-self-join-query
  "A query on VENUES joined to VENUES as \"Peer\" with all fields, so the card returns `NAME` and `NAME_2`.

    (venues-self-join-query) ;=> {:stages [{:source-table venues-id, :joins [{:alias \"Peer\" ...}]}]}"
  []
  (let [mp     (mt/metadata-provider)
        venues (lib.metadata/table mp (mt/id :venues))
        id     (lib.metadata/field mp (mt/id :venues :id))]
    (-> (lib/query mp venues)
        (lib/join (-> (lib/join-clause venues [(lib/= id (lib/with-join-alias id "Peer"))])
                      (lib/with-join-alias "Peer")
                      (lib/with-join-fields :all))))))

(defn orders-model-query
  "A query on ORDERS with the expressions `Doubled Total` (numeric) and `Ship Date` (temporal).

    (orders-model-query) ;=> {:stages [{:source-table orders-id, :expressions [...]}]}"
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/expression "Doubled Total" (lib/* (lib.metadata/field mp (mt/id :orders :total)) 2))
        (lib/expression "Ship Date" (lib/datetime-add (lib.metadata/field mp (mt/id :orders :created_at)) 3 :day)))))
