(ns metabase-enterprise.mcp.v2.tools.run-saved-question-sandbox-test
  "Sandboxing interaction for the v2 `run_saved_question` tool. The tool binds
   [[metabase.query-processor.card/*allow-arbitrary-mbql-parameters*]] true so a saved
   question's declared MBQL filter-widget parameters run; sandboxing is query-processor
   middleware that is orthogonal to that flag, and a parameter can only AND a filter onto the
   query, never remove the sandbox's own filter. This pins that: a sandboxed user cannot use a
   dimension parameter to reach rows outside their sandbox. Lives in enterprise because GTAPs do."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   ;; registers the run_saved_question tool for the call-tool seam below
   [metabase.mcp.v2.tools.query]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- widget-only-products-query
  "The GTAP query: PRODUCTS restricted to CATEGORY = \"Widget\", so a sandboxed user never sees
   any other category through this table."
  []
  (let [mp    (mt/metadata-provider)
        table (lib.metadata/table mp (mt/id :products))
        cat   (lib.metadata/field mp (mt/id :products :category))]
    (lib/filter (lib/query mp table) (lib/= cat "Widget"))))

(defn- products-card-with-category-param
  "A plain MBQL question over PRODUCTS with a declared filter-widget parameter targeting the
   CATEGORY field."
  [card-name]
  (let [mp (mt/metadata-provider)]
    {:name          card-name
     :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))
     :parameters    [{:id     "p1"
                      :slug   "cat_dim"
                      :name   "Category"
                      :type   :string/=
                      :target [:dimension [:field (mt/id :products :category) nil]]}]}))

(defn- categories
  "The distinct CATEGORY values in a successful tool result's rows."
  [result]
  (when (:isError result)
    (throw (ex-info (str "Tool call errored: " (-> result :content first :text)) {:result result})))
  (let [[payload]           (str/split (-> result :content first :text) #"\n" 2)
        {:keys [cols rows]} (json/decode+kw payload)
        idx                 (first (keep-indexed #(when (= "CATEGORY" (:name %2)) %1) cols))]
    (set (map #(nth % idx) rows))))

(defn- run-saved-question [card-id parameters]
  (registry/call-tool nil (str (random-uuid)) "run_saved_question"
                      (cond-> {:id card-id :row_limit 2000}
                        parameters (assoc :parameters parameters))))

(deftest sandboxed-mbql-parameter-cannot-escape-sandbox-test
  (testing "an MBQL dimension parameter runs within the sandbox and cannot reach rows outside it"
    (met/with-gtaps! {:gtaps {:products {:query (widget-only-products-query)}}}
      (mt/with-temp [:model/Card {card-id :id} (products-card-with-category-param "rsq sandbox")]
        (testing "with no parameter the sandboxed user sees only their permitted category"
          (let [cats (categories (run-saved-question card-id nil))]
            (is (= #{"Widget"} cats)
                "the sandbox filter must apply through the tool path")))
        (testing "a parameter selecting the permitted category still returns rows"
          (is (= #{"Widget"} (categories (run-saved-question card-id [{:id "cat_dim" :value ["Widget"]}])))))
        (testing "a parameter selecting a category outside the sandbox returns nothing, never those rows"
          (let [result (run-saved-question card-id [{:id "cat_dim" :value ["Gadget"]}])
                cats   (categories result)]
            (is (empty? cats)
                "sandbox (Widget) AND parameter (Gadget) is empty — the parameter cannot widen access")
            (is (not (contains? cats "Gadget")))))))))
