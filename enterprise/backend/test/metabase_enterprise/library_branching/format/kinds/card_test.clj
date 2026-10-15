(ns metabase-enterprise.library-branching.format.kinds.card-test
  "The codecs of the card kinds :question and :model, and the references of a card."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.card :as card]
   [metabase-enterprise.library-branching.format.kinds.model :as model]
   [metabase-enterprise.library-branching.format.kinds.question :as question]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.mutation.core :as mut]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private sd "Sample Database")
(def ^:private orders [sd "PUBLIC" "ORDERS"])
(def ^:private question-id "qUeStIoNqUeStIoNqUeS1")
(def ^:private model-id "mOdElMoDeLmOdElMoDeL1")
(def ^:private app-id "aPpCoLlEcTiOnApPcOlL1")
(def ^:private dashboard-id "dAsHbOaRdDaShBoArDdA1")
(def ^:private document-id "dOcUmEnTdOcUmEnTdOcU1")

(def ^:private query
  {:lib/type "mbql/query"
   :database sd
   :stages   [{:lib/type "mbql.stage/mbql" :source-table orders}]})

(def ^:private query-refs
  #{[:database [:env [sd]]] [:source-table [:env orders]]})

(defn- item
  [kind attrs]
  (let [id (if (= :model kind) model-id question-id)]
    {:kind kind :name "Orders" :place app-id :refs (kinds/refs kind id attrs) :attrs attrs}))

(defn- fits? [codec x] (mr/validate (codec/schema codec) x))

(defn- utf-8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- file-text [codec id x] (String. ^bytes (writer/write-yaml (codec/encode codec id x)) "UTF-8"))

(defn- decode-text [codec s] (codec/decode codec (codec/read-yaml (utf-8 s))))

(defn- invalid? [codec s]
  (try
    (decode-text codec s)
    false
    (catch clojure.lang.ExceptionInfo e
      (= ::codec/invalid (:type (ex-data e))))))

(deftest file-test
  (testing "a question is the file <name>.question.yaml and a model the file <name>.model.yaml, in the directory of
           their collection"
    (let [app {:kind :collection :name "Sales app" :place nil :refs #{} :attrs {:namespace "data-apps"}}]
      (is (= {app-id      "apps/sales_app/_collection.yaml"
              question-id "apps/sales_app/orders.question.yaml"
              model-id    "apps/sales_app/orders.model.yaml"}
             (layout/layout kinds/codecs {app-id      app
                                          question-id (item :question {:display "table" :query query})
                                          model-id    (item :model {:display "table" :query query})})))))
  (testing "the file of a question: the place as collection, the dashboard as dashboard_id, no implied :lib/type"
    (let [q (item :question {:display "table" :query query :dashboard_id dashboard-id})]
      (is (= (str "kind: question\nid: " question-id "\ncollection: " app-id "\ndashboard_id: " dashboard-id
                  "\ndisplay: table\nname: Orders\nquery:\n  database: Sample Database\n  stages:\n"
                  "  - source-table: [Sample Database, PUBLIC, ORDERS]\n")
             (file-text question/codec question-id q)))
      (is (= [question-id q] (decode-text question/codec (file-text question/codec question-id q))))))
  (testing "the file of a model holds its result metadata"
    (let [m (item :model {:display "table" :query query :result_metadata [{:name "TOTAL" :display_name "Total"}]})]
      (is (= [model-id m] (decode-text model/codec (file-text model/codec model-id m)))))))

(deftest attributes-test
  (testing "the attributes of every card, and those of each kind"
    (let [common #{:description :display :query :visualization_settings :parameters :parameter_mappings
                   :collection_position :collection_preview}]
      (is (= common (set (keys card/attrs))))
      (is (= (conj common :dashboard_id :document_id) (set (keys (:attrs question/spec)))))
      (is (= (conj common :result_metadata) (set (keys (:attrs model/spec)))))))
  (testing "the result metadata of a question is derived, so it is no attribute; a metric's dimensions are not
           attributes of a question or a model"
    (doseq [[codec kind k v] [[question/codec :question :result_metadata [{:name "TOTAL"}]]
                              [question/codec :question :dimensions [{:a 1}]]
                              [model/codec :model :dimensions [{:a 1}]]
                              [model/codec :model :dashboard_id dashboard-id]]]
      (is (not (fits? codec (item kind {:display "table" :query query k v}))) (str kind " " k))))
  (testing "a question and a model need a display and a query"
    (is (fits? question/codec (item :question {:display "table" :query query})))
    (is (not (fits? question/codec (item :question {:query query}))))
    (is (not (fits? model/codec (item :model {:display "table"})))))
  (testing "a dashboard and a document are named by entity id"
    (is (not (fits? question/codec (item :question {:display "table" :query query :dashboard_id 12}))))
    (is (not (fits? question/codec (item :question {:display "table" :query query :document_id "x"})))))
  (testing "the result metadata of a model is a vector of columns, and empty is no metadata"
    (is (not (fits? model/codec (item :model {:display "table" :query query :result_metadata []}))))
    (is (not (fits? model/codec (item :model {:display "table" :query query :result_metadata ["TOTAL"]})))))
  (testing "Q5: the public link, the embedding settings and the bookkeeping columns are not content"
    (doseq [k [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type :entity_id
               :created_at :updated_at :creator_id :archived :card_schema :type :query_type :database_id]
            [codec kind] [[question/codec :question] [model/codec :model]]]
      (is (not (fits? codec (assoc-in (item kind {:display "table" :query query}) [:attrs k] "x")))
          (str kind " " k))
      (is (invalid? codec (str (file-text codec question-id (item kind {:display "table" :query query}))
                               (name k) ": x\n"))
          (str kind " " k)))))

(deftest refs-test
  (testing "a dashboard question refers to its dashboard, and a question of a document to its document"
    (is (= (conj query-refs [:dashboard dashboard-id])
           (kinds/refs :question question-id {:display "table" :query query :dashboard_id dashboard-id})))
    (is (= (conj query-refs [:document document-id])
           (kinds/refs :question question-id {:display "table" :query query :document_id document-id}))))
  (testing "the columns of a model refer to their fields, tables and target fields"
    (is (= (conj query-refs
                 [:field [:env (conj orders "TOTAL")]]
                 [:field [:env (conj orders "ID")]]
                 [:field [:env [sd "PUBLIC" "PEOPLE" "ID"]]]
                 [:table [:env orders]])
           (kinds/refs :model model-id
                       {:display         "table"
                        :query           query
                        :result_metadata [{:name      "TOTAL"
                                           :field_ref ["field" (conj orders "TOTAL") nil]}
                                          {:name               "USER_ID"
                                           :id                 (conj orders "ID")
                                           :table_id           orders
                                           :fk_target_field_id [sd "PUBLIC" "PEOPLE" "ID"]}]}))))
  (testing "the visualization settings and the parameters of a question hold references"
    (is (= (conj query-refs [:dashboard dashboard-id] [:card model-id])
           (kinds/refs :question question-id
                       {:display                "table"
                        :query                  query
                        :parameters             [{:id "p" :values_source_config {:card_id model-id}}]
                        :visualization_settings {:click_behavior {:type     "link"
                                                                  :linkType "dashboard"
                                                                  :targetId dashboard-id}}})))))

;;; ------------------------------------------ The serdes walk of master ---------------------------------------------

(def ^:private role-models
  "The serdes model of the target of each role of an item reference."
  {:card "Card" :source-card "Card" :metric "Card" :dashboard "Dashboard" :document "Document"
   :collection "Collection" :timeline "Timeline" :segment "Segment" :measure "Measure" :snippet "NativeQuerySnippet"})

(defn- serdes-card
  "The card of the portable attributes `attrs` at `place`, in the form that the serdes walk of master reads: the
  columns of the export, with the column settings keys as strings."
  [place attrs]
  (cond-> (-> attrs
              (dissoc :query)
              (assoc :collection_id place :dataset_query (:query attrs) :serdes/meta [{:model "Card"}]))
    (map? (get-in attrs [:visualization_settings :column_settings]))
    (update-in [:visualization_settings :column_settings] update-keys #(subs (str %) 1))))

(defn- serdes-targets
  "`#{[model id]}`: the items that the serdes walk of master follows from a card: the dependencies of its load."
  [place attrs]
  (into #{}
        (keep (fn [path]
                (let [{:keys [model id]} (last path)]
                  (when (contains? (set (vals role-models)) model) [model id]))))
        (serdes/deserialization-dependencies (serdes-card place attrs))))

(defn- ref-targets
  [place refs]
  (into #{["Collection" place]} (keep (fn [[role target]] (when-let [m (get role-models role)] [m target]))) refs))

(def ^:private parameter-gen
  "A parameter in the portable form: with its values from a card, or with no values source."
  (gen/one-of [(gen/fmap (fn [id] {:id "p" :type "category" :values_source_type "card"
                                   :values_source_config {:card_id id :value_field ["field" "TOTAL" nil]}})
                         lb.tu/entity-id-gen)
               (gen/return {:id "q" :type "category"})]))

(def ^:private parameter-mapping-gen
  "A parameter mapping in the portable form, to a field of the card or of another card."
  (gen/fmap (fn [[id k]] {:parameter_id "p" :card_id id :target ["dimension" ["field" k nil]]})
            (gen/tuple lb.tu/entity-id-gen kinds.tu/field-key-gen)))

(defn- walkable
  "Generates `[kind attrs]` of the kind `kind` from `attrs-gen`, with the parts that the serdes walk reads in the
  shapes that it reads: visualization settings with every position that holds a reference, parameters and parameter
  mappings."
  [kind attrs-gen]
  (gen/fmap (fn [[attrs [settings] params mappings]]
              [kind (cond-> (dissoc attrs :visualization_settings :parameters :parameter_mappings)
                      settings        (assoc :visualization_settings settings)
                      (seq params)    (assoc :parameters params)
                      (seq mappings)  (assoc :parameter_mappings mappings))])
            (gen/tuple attrs-gen
                       (gen/one-of [(gen/return [nil]) kinds.tu/visualization-settings-refs-gen])
                       (gen/vector parameter-gen 0 2)
                       (gen/vector parameter-mapping-gen 0 2))))

(def ^:private walkable-card-gen
  (gen/one-of [(walkable :question kinds.tu/question-attrs-gen) (walkable :model kinds.tu/model-attrs-gen)]))

(defspec refs-contain-the-serdes-walk-test 200
  ;; ARCHITECTURE.md 5: the references of a card hold every item that master's serdes walk follows from it.
  (prop/for-all [[[kind attrs] place] (gen/tuple walkable-card-gen lb.tu/entity-id-gen)]
    (every? (ref-targets place (kinds/refs kind question-id attrs)) (serdes-targets place attrs))))

(deftest serdes-walk-coverage-test
  (testing "the generated cards make the serdes walk follow each kind of item that a card can name"
    (let [models (into #{}
                       (comp (mapcat (fn [[_ attrs]] (serdes-targets app-id attrs))) (map first))
                       (gen/sample walkable-card-gen 300))]
      (is (= #{"Card" "Collection" "Dashboard" "Document" "Measure" "NativeQuerySnippet" "Segment" "Timeline"}
             models)))))

;;; ------------------------------------------------ The laws -------------------------------------------------------

(defspec card-round-trip-test 200
  (prop/for-all [[codec kind attrs] (gen/one-of [(gen/tuple (gen/return question/codec) (gen/return :question)
                                                            kinds.tu/question-attrs-gen)
                                                 (gen/tuple (gen/return model/codec) (gen/return :model)
                                                            kinds.tu/model-attrs-gen)])]
    (let [x (item kind attrs)]
      (and (fits? codec x)
           (= [question-id x] (codec/decode codec (codec/read-yaml (writer/write-yaml (codec/encode codec question-id x)))))))))

(deftest tree-test
  (testing "a tree with a question and a model in a data app's collection decodes to its snapshot"
    (let [s     {app-id      {:kind :collection :name "Sales app" :place nil :refs #{} :attrs {:namespace "data-apps"}}
                 question-id (item :question {:display "table" :query query :description "All orders."})
                 model-id    (item :model {:display "table" :query query :result_metadata [{:name "TOTAL"}]})}
          files (writer/encode-tree kinds/codecs s)]
      (is (= {:snapshot s} (tree/decode-tree kinds/codecs (vals files)))))))

;;; ------------------------------------------------ Mutations ------------------------------------------------------

(def ^:private mutations
  [{:name   :no-holder-refs
    :doc    "A dashboard question does not refer to its dashboard, so validate does not see a question whose dashboard
            is out of scope."
    :target `card/refs
    :edits  [[:replace '(keep (fn [[k role]] (when-some [v (get attrs k)] [role v]))) '(map identity)]]}
   {:name   :no-column-refs
    :doc    "The columns of a model refer to no field, so a model whose metadata names a field of another warehouse
            validates."
    :target `card/refs
    :edits  [[:replace '(mapcat column-refs) '(map identity)]]}
   {:name   :no-target-field
    :doc    "A column does not refer to the target field of its foreign key."
    :target `card/column-refs
    :edits  [[:replace '(vector? fk_target_field_id) false]]}])

(deftest card-mutations-test
  (mut/check mutations {:tests [#'refs-test #'refs-contain-the-serdes-walk-test]}))
