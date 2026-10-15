(ns metabase-enterprise.library-branching.format.kinds.action-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.action :as action]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.toy-codec :as toy]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private refund-id "rEfUnDoRdErAcTiOn0001")
(def ^:private refund-all-id "rEfUnDaLlAcTiOn000001")
(def ^:private refunds-id "rEfUnDsCoLlEcTiOn0001")
(def ^:private model-id "oRdErSmOdEl0000000001")
(def ^:private question-id "qUeStIoNoRdErS000001x")
(def ^:private model-action-id "mOdElReFuNdAcTiOn0001")
(def ^:private implicit-id "iMpLiCiTcReAtE0000001")

(def ^:private native-query
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type      "mbql.stage/native"
               :native        "UPDATE orders SET refunded = true WHERE id = {{id}}"
               :template-tags {:id {:type "number" :name "id" :display-name "ID" :id "6a1f0c2e-61a4-4a70-a1d1-3b2c5d7e9f10"}}}]})

(def ^:private parameters
  [{:id "6a1f0c2e-61a4-4a70-a1d1-3b2c5d7e9f10" :name "ID" :slug "id" :type "number/="
    :target ["variable" ["template-tag" "id"]]}])

(defn- item
  "An action at `place` with the attributes `attrs`, and the references of its attributes."
  [id place attrs]
  {:kind :action :name "Refund order" :place place :refs (kinds/refs :action id attrs) :attrs attrs})

(def ^:private query-attrs {:type "query" :dataset_query native-query :parameters parameters})

(defn- valid? [x] (mr/validate (codec/schema action/codec) x))

(defn- round-trip
  [id x]
  (codec/decode action/codec (codec/read-yaml (writer/write-yaml (codec/encode action/codec id x)))))

;;; ------------------------------------------------------ Documents --------------------------------------------------

(deftest encode-test
  (testing "an action in a data actions collection: the place under collection, the query with no implied :lib/type"
    (is (= {:kind          "action"
            :id            refund-id
            :name          "Refund order"
            :collection    refunds-id
            :type          "query"
            :parameters    parameters
            :dataset_query {:database sd
                            :stages   [{:native        "UPDATE orders SET refunded = true WHERE id = {{id}}"
                                        :template-tags (get-in native-query [:stages 0 :template-tags])}]}}
           (codec/encode action/codec refund-id (item refund-id refunds-id query-attrs)))))
  (testing "an action at the root of the data actions area has no collection"
    (is (not (contains? (codec/encode action/codec refund-id (item refund-id nil query-attrs)) :collection))))
  (testing "an action with a model names its model, and has no collection: its place is the model"
    (let [doc (codec/encode action/codec model-action-id
                            (item model-action-id model-id (assoc query-attrs :model model-id)))]
      (is (= model-id (:model doc)))
      (is (not (contains? doc :collection)))))
  (testing "an implicit action: its model and its kind, and no query"
    (is (= {:kind "action" :id implicit-id :name "Refund order" :model model-id :type "implicit" :implicit_kind "row/create"}
           (codec/encode action/codec implicit-id
                         (item implicit-id model-id {:type "implicit" :model model-id :implicit_kind "row/create"}))))))

(deftest decode-test
  (doseq [[what id x] [["in a collection" refund-id (item refund-id refunds-id query-attrs)]
                       ["at the root" refund-id (item refund-id nil query-attrs)]
                       ["with a model" model-action-id (item model-action-id model-id (assoc query-attrs :model model-id))]
                       ["implicit" implicit-id (item implicit-id model-id {:type "implicit" :model model-id
                                                                           :implicit_kind "row/update"})]]]
    (testing (str "an action " what " decodes to itself, through the bytes of its file")
      (is (valid? x))
      (is (= [id x] (round-trip id x)))))
  (testing "a document with a model and a collection is invalid: the place of an action with a model is its model"
    (let [doc (assoc (codec/encode action/codec model-action-id
                                   (item model-action-id model-id (assoc query-attrs :model model-id)))
                     :collection refunds-id)]
      (is (= ::codec/invalid (try (codec/decode action/codec doc) nil
                                  (catch clojure.lang.ExceptionInfo e (:type (ex-data e)))))))))

(defspec action-round-trip-test 200
  ;; decode(encode(c)) = c for generated actions: no model, in a collection or at the root; and on a model.
  (prop/for-all [[id x] (gen/fmap (fn [[id place attrs]] [id (item id (or (:model attrs) place) attrs)])
                                  (gen/tuple lb.tu/entity-id-gen
                                             (gen/one-of [(gen/return nil) lb.tu/entity-id-gen])
                                             (gen/one-of [kinds.tu/action-attrs-gen
                                                          (gen/bind lb.tu/entity-id-gen kinds.tu/model-action-attrs-gen)])))]
    (and (valid? x) (= [id x] (round-trip id x)))))

;;; ---------------------------------------------------- References ---------------------------------------------------

(deftest refs-test
  (testing "the references of an action: its database, the references of its query and its parameters"
    (is (= #{[:database [:env [sd]]]}
           (kinds/refs :action refund-id query-attrs)))
    (let [q (assoc-in native-query [:stages 0 :template-tags :card] {:type "card" :name "card" :card-id question-id
                                                                     :id   "2b7d0a6e-1c55-4f0e-9a43-6d5a8b2f6a11"})]
      (is (= #{[:database [:env [sd]]] [:card question-id]}
             (kinds/refs :action refund-id (assoc query-attrs :dataset_query q))))))
  (testing "an action with a model refers to its model with the role :model"
    (is (= #{[:model model-id]}
           (kinds/refs :action implicit-id {:type "implicit" :model model-id :implicit_kind "row/create"}))))
  (testing "the references of the parameter mappings and of the visualization settings"
    (let [field [sd "PUBLIC" "ORDERS" "ID"]]
      (is (= #{[:database [:env [sd]]] [:field [:env field]] [:dashboard question-id]}
             (kinds/refs :action refund-id
                         (assoc query-attrs
                                :parameter_mappings     [{:parameter_id "p" :target ["dimension" ["field" field nil]]}]
                                :visualization_settings {:click_behavior {:type "link" :linkType "dashboard"
                                                                          :targetId question-id}}))))))
  (testing "the schema refuses an item whose references are not those of its attributes"
    (is (not (valid? (update (item refund-id nil query-attrs) :refs conj [:card question-id]))))
    (is (not (valid? (update (item implicit-id model-id {:type "implicit" :model model-id :implicit_kind "row/create"})
                             :refs disj [:model model-id]))))))

;;; ---------------------------------------------------- Attributes ---------------------------------------------------

(deftest attributes-test
  (testing "the content attributes of an action"
    (is (= #{:description :model :type :implicit_kind :dataset_query :parameters :parameter_mappings :visualization_settings}
           (set (keys (:attrs action/spec))))))
  (testing "instance-local attributes, the derived database and collection, and the bookkeeping columns are not
            content"
    (doseq [k [:public_uuid :made_public_by_id :public_uuid_prefix :database_id :collection_id :model_id :archived
               :archived_directly :entity_id :created_at :updated_at :creator_id]]
      (is (not (valid? (assoc-in (item refund-id nil query-attrs) [:attrs k] "x"))) (str k))))
  (testing "an attribute at its default is not in :attrs"
    (doseq [[k v] [[:parameters []] [:parameter_mappings []] [:visualization_settings {}] [:description nil]]]
      (is (not (valid? (assoc-in (item refund-id nil query-attrs) [:attrs k] v))) (str k)))))

(deftest type-test
  (testing "a query action has a query and no implicit kind"
    (is (not (valid? (item refund-id nil (dissoc query-attrs :dataset_query :parameters)))))
    (is (not (valid? (item refund-id nil (assoc query-attrs :implicit_kind "row/create"))))))
  (testing "an implicit action has a model and a kind, and no query"
    (is (valid? (item implicit-id model-id {:type "implicit" :model model-id :implicit_kind "row/delete"})))
    (is (not (valid? (item implicit-id nil {:type "implicit" :implicit_kind "row/delete"}))))
    (is (not (valid? (item implicit-id model-id {:type "implicit" :model model-id}))))
    (is (not (valid? (item implicit-id model-id {:type "implicit" :model model-id :implicit_kind "row/delete"
                                                 :dataset_query native-query}))))
    (is (not (valid? (item implicit-id model-id {:type "implicit" :model model-id :implicit_kind "row/upsert"})))))
  (testing "an action of another type is invalid: Metabase has no HTTP actions"
    (is (not (valid? (item refund-id nil (assoc query-attrs :type "http")))))))

(deftest place-test
  (testing "an action with a model has the model as its place"
    (let [attrs (assoc query-attrs :model model-id)]
      (is (valid? (item model-action-id model-id attrs)))
      (is (not (valid? (item model-action-id refunds-id attrs))))
      (is (not (valid? (item model-action-id nil attrs))))))
  (testing "an action with no model is at the root or in a collection"
    (is (valid? (item refund-id nil query-attrs)))
    (is (valid? (item refund-id refunds-id query-attrs)))))

;;; ------------------------------------------------------ Layout -----------------------------------------------------

(def ^:private toy-model-codec
  "A codec of the kind :model for the layout: a model is the file `<name>.model.yaml`."
  (toy/->ToyCodec :model "model" false (constantly {:dir ["library"]})))

(deftest layout-test
  (let [refunds {:kind :collection :name "Refunds" :place nil :refs #{} :attrs {:namespace "data-actions"}}
        model   {:kind :model :name "Orders" :place nil :refs #{} :attrs {}}]
    (testing "an action at the root is in actions/; an action in a data actions collection is in its directory"
      (is (= {refunds-id    "actions/refunds/_collection.yaml"
              refund-id     "actions/refund_order.action.yaml"
              refund-all-id "actions/refunds/refund_order.action.yaml"}
             (layout/layout kinds/codecs {refunds-id    refunds
                                          refund-id     (item refund-id nil query-attrs)
                                          refund-all-id (item refund-all-id refunds-id query-attrs)}))))
    (testing "an action with a model is in the directory of its model"
      (is (= {model-id        "library/orders.model.yaml"
              model-action-id "library/orders.model/refund_order.action.yaml"}
             (layout/layout (conj kinds/codecs toy-model-codec)
                            {model-id        model
                             model-action-id (item model-action-id model-id (assoc query-attrs :model model-id))}))))))

;;; ------------------------------------------------------ Validate ---------------------------------------------------

(deftest action-model-rule-test
  ;; ARCHITECTURE 9 rule 8: an action that names a model refers to an item of kind model. Validate reads only the
  ;; kind, place and references of an item, so the model and the question here are bare items.
  (let [may-contain (merge {:model #{:action} :question #{}} snapshot/may-contain)
        model       {:kind :model :name "Orders" :place nil :refs #{} :attrs {}}
        on          (fn [card-id] (item model-action-id card-id (assoc query-attrs :model card-id)))]
    (testing "an action on a model is well formed"
      (is (= [] (validate/validate {model-id model model-action-id (on model-id)} {:may-contain may-contain}))))
    (testing "an action on a question is a finding: the question cannot contain it, and its model reference is not a
              model"
      (is (= [{:rule :kind-fits :id model-action-id :place question-id}
              {:rule :ref-kind :id model-action-id :ref [:model question-id]}]
             (validate/validate {question-id (assoc model :kind :question) model-action-id (on question-id)}
                                {:may-contain may-contain}))))
    (testing "an action whose model is not in the snapshot is a finding: its place and its reference do not close"
      (is (= [{:rule :place-inside :id model-action-id :place model-id}
              {:rule :refs-closed :id model-action-id :ref [:model model-id]}]
             (validate/validate {model-action-id (on model-id)} {:may-contain may-contain}))))
    (testing "a collection can contain an action; an action contains nothing"
      (is (contains? (:collection snapshot/may-contain) :action))
      (is (= #{} (:action snapshot/may-contain))))))

;;; ----------------------------------------------------- Mutations ---------------------------------------------------

(def ^:private mutations
  [{:name   :model-ref-dropped
    :doc    "An action has no reference to its model, so the action-model rule cannot see an action on a question."
    :target `action/refs
    :edits  [[:replace '(conj [:model model]) '(identity)]]}
   {:name   :query-refs-dropped
    :doc    "An action has no references of its query, so validate cannot find a removed card that the query reads."
    :target `action/refs
    :edits  [[:replace '(portable/query-refs dataset_query) #{}]]}
   {:name   :place-not-the-model
    :doc    "The schema does not check that the place of an action with a model is the model."
    :target `action/in-its-model?
    :edits  [[:replace '(= model place) true]]}
   {:name   :any-type-fits
    :doc    "The schema does not check that the attributes fit the type, so a query action can have no query."
    :target `action/fits-type?
    :edits  [[:replace '(and (some? dataset_query) (nil? implicit_kind)) true]]}
   {:name   :implicit-needs-no-model
    :doc    "An implicit action may have no model, which Metabase refuses on save."
    :target `action/fits-type?
    :edits  [[:replace '(some? model) true]]}
   {:name   :collection-kept
    :doc    "Encode writes the collection of an action with a model, so its file has two places."
    :target `action/encode
    :edits  [[:replace '(dissoc :collection) '(identity)]]}
   {:name   :place-not-from-model
    :doc    "Decode does not take the place of an action with a model from the model."
    :target `action/decode
    :edits  [[:replace '(assoc :place (:model attrs)) '(identity)]]}
   {:name   :two-places-accepted
    :doc    "Decode accepts a document with a model and a collection, and drops the collection in silence."
    :target `action/decode
    :edits  [[:replace '(and (some? (:model doc)) (some? (:collection doc))) false]]}
   {:name   :query-implied-not-restored
    :doc    "Decode does not restore the implied keys of the query."
    :target `action/decode-attrs
    :edits  [[:replace '(update :dataset_query portable/restore-implied) '(identity)]]}
   {:name   :query-implied-written
    :doc    "Encode writes the implied keys of the query."
    :target `action/encode-attrs
    :edits  [[:replace '(update :dataset_query portable/omit-implied) '(identity)]]}])

(deftest action-mutations-test
  (mut/check mutations {:tests [#'encode-test #'decode-test #'refs-test #'type-test #'place-test
                                #'action-model-rule-test]}))
