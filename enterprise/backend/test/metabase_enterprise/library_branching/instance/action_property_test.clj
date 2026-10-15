(ns metabase-enterprise.library-branching.instance.action-property-test
  "The laws of `write!` and `current` for actions, as property tests: PutGet (current after a write returns the
  written content, also after earlier writes of other content to the same identity, with another place or type) and
  GetPut (a write of the current content changes no row). Each trial writes in a transaction that rolls back.

  The generators are constructive: a query and parameters are ones that a real action of the trial's world has, so
  each written value is in the form that the instance reads. A value that depends on the trial's app DB rows is a
  keyword that [[resolve-item]] replaces, so the generators filter nothing, and a shrunk case has fewer writes and the
  first value of each choice."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.walk :as walk]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users) features.tu/with-features)

;;; ---------------------------------------------------- The world ---------------------------------------------------

(defn- store [] (get app-db/kind-stores :action))

(defn- insert-query-action!
  [row sql]
  (let [action (t2/insert-returning-instance! :model/Action (merge {:name "World" :type :query
                                                                    :creator_id (mt/user->id :rasta)}
                                                                   row))]
    (t2/insert! :model/QueryAction {:action_id     (:id action)
                                    :dataset_query (lib/native-query (mt/metadata-provider) sql)})
    action))

(defn- do-with-world!
  "Calls `f` with `{keyword value}`, the values of the keywords of the generated items for the collections, models,
  queries and parameters of this call, in a transaction that rolls back."
  [f]
  (t2/with-transaction [_ nil {:rollback-only true}]
    (let [refunds (t2/insert-returning-instance! :model/Collection {:name "Refunds" :namespace "data-actions"
                                                                    :location "/"})
          returns (t2/insert-returning-instance! :model/Collection {:name "Returns" :namespace "data-actions"
                                                                    :location "/"})
          apps    (t2/insert-returning-instance! :model/Collection {:name "Sales portal" :namespace "data-apps"
                                                                    :location "/"})
          model   #(t2/insert-returning-instance! :model/Card {:name          %
                                                               :type          :model
                                                               :collection_id (:id apps)
                                                               :creator_id    (mt/user->id :rasta)
                                                               :display       :table
                                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                                (lib/query mp (lib.metadata/table mp (mt/id :venues))))
                                                               :visualization_settings {}})
          m1      (model "Orders model")
          m2      (model "Places model")
          a1      (insert-query-action! {:parameters [{:id "aaaa" :name "Name" :slug "name" :type :string/=
                                                       :target [:variable [:template-tag "name"]]}
                                                      {:id "bbbb" :name "ID" :slug "id" :type :number/=
                                                       :target [:variable [:template-tag "id"]]}]}
                                        "UPDATE venues SET name = {{name}} WHERE id = {{id}}")
          a2      (insert-query-action! {} "UPDATE venues SET name = 'x'")
          content #(instance/current (store) (:entity_id %))]
      (f {::refunds (:entity_id refunds)
          ::returns (:entity_id returns)
          ::m1      (:entity_id m1)
          ::m2      (:entity_id m2)
          ::q1      (get-in (content a1) [:attrs :dataset_query])
          ::q2      (get-in (content a2) [:attrs :dataset_query])
          ::p1      (get-in (content a1) [:attrs :parameters])}))))

(defn- resolve-item
  "`item` with each keyword of this namespace replaced by its value in `world`, and the references of its attributes."
  [world item]
  (let [item (walk/postwalk #(if (and (keyword? %) (= (namespace ::here) (namespace %))) (get world %) %) item)]
    (assoc item :refs (format.kinds/refs :action nil (:attrs item)))))

;;; --------------------------------------------------- Generators --------------------------------------------------

(defn- optional
  [g]
  (gen/one-of [(gen/return nil) g]))

(def ^:private item-gen
  "An action: no model (at the Data actions area root or in a collection) or on a model; of type query, or implicit on
  a model."
  (gen/fmap
   (fn [[action-name place on-model? implicit? kind query params description confirm]]
     (let [model     (when on-model? (if (zero? (mod place 2)) ::m1 ::m2))
           implicit? (and model implicit?)
           attrs     (cond-> {:type (if implicit? "implicit" "query")}
                       model                    (assoc :model model)
                       implicit?                (assoc :implicit_kind kind)
                       (not implicit?)          (assoc :dataset_query query)
                       (and params (not implicit?)) (assoc :parameters ::p1)
                       description              (assoc :description description)
                       confirm                  (assoc :visualization_settings {:confirmMessage confirm}))]
       {:kind  :action
        :name  action-name
        :place (or model (get ["dataactionsdataaction" ::refunds ::returns] (mod place 3)))
        :attrs attrs}))
   (gen/tuple (gen/elements ["Refund" "Return" "Société"])
              gen/nat
              gen/boolean
              gen/boolean
              (gen/elements ["row/create" "row/update" "row/delete"])
              (gen/elements [::q1 ::q2])
              gen/boolean
              (optional (gen/elements ["Marks an order." "Line\nline"]))
              (optional (gen/elements ["Sure?" "Refund it?"])))))

;;; ------------------------------------------------------ Laws ------------------------------------------------------

(def ^:private id "lbActionLaws000000001")

(defn- rows
  []
  (let [row (t2/select-one :action :entity_id id)]
    [row
     (t2/select-one :query_action :action_id (:id row))
     (t2/select-one :implicit_action :action_id (:id row))]))

(defspec put-get-get-put-test 40
  (prop/for-all [items (gen/vector item-gen 1 4)]
    (do-with-world!
     (fn [world]
       (every? (fn [item]
                 (let [item (resolve-item world item)]
                   (instance/write! (store) id item)
                   (and (= item (instance/current (store) id))
                        (let [before (rows)]
                          (instance/write! (store) id (instance/current (store) id))
                          (= before (rows))))))
               items)))))
