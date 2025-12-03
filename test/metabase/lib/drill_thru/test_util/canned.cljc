(ns metabase.lib.drill-thru.test-util.canned
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]
   [metabase.util :as u]))

(defn- base-context [column value]
  {:column     column
   :column-ref (when column (lib/ref column))
   :value      value})

(defn- dimensions [{:keys [query row] :as _test-case}]
  (not-empty (for [breakout (lib/breakouts query)
                   :let [column (lib/breakout-column query -1 breakout)]]
               (base-context column (get row (:name column))))))

(defn- column-by-name [{:keys [query]} column-name]
  (lib.drill-thru.tu/column-by-name query column-name))

(defn- null-value [{:keys [value] :as context}]
  ; This special case is only for *top-level* contexts, not :dimensions or :row, hence the separate function.
  (cond-> context
    (nil? value) (assoc :value :null)))

(defn cell-click
  "Given a test case and a column name, returns a drill-thru context for a click on a cell of that column.
  (\"Cell\" is used broadly to mean clicking a literal table cell, a point in a time series, a bar in a histogram, etc.)

  Such a context has both `:column` and `:value` set. The `:value` comes from the `test-case`. Note that a SQL NULL
  value appears as `:value :null`. (`:value nil` indicates no value was provided.)

  Any breakouts in the query **except the one which was clicked** appear in `:dimensions`."
  [{:keys [row] :as test-case} column-name]
  (let [base (-> (column-by-name test-case column-name)
                 (base-context (get row column-name))
                 null-value
                 (assoc :row (for [[col value] row]
                               (base-context (column-by-name test-case col)
                                             value))))
        dims (dimensions test-case)]
    ;; If the query contains aggregations, the resulting context depends on what we clicked.
    ;; On clicking an aggregation, :dimensions is populated. On clicking a breakout, we just get that column.
    (cond
      ;; Clicking a breakout - just the base context.
      (and dims (some #(= (:name (:column %)) column-name) dims)) base
      ;; Clicking an aggregation - include the dimensions
      dims                                                   (assoc base :dimensions dims)
      ;; Clicking neither kind of cell - just the base context.
      :else                                                  base)))

(defn header-click
  "Given a test case and a column name, returns a drill-thru context for a click on that column's header.

  Such a context has a `:column` but no `:value`. Likewise there are no `:dimensions` at the column level."
  [test-case column-name]
  (base-context (column-by-name test-case column-name) nil))

;; Legend clicks have nil column, nil value, but have exactly one dimensions with a value.
(defn legend-click
  "Given a test case and a column name, returns a drill-thru context for a click on a legend entry on a multi-series
  chart. (The `column-name` is the name of the column shown in the legend, typically a category or bucketed cohort.)

  Such a context has `nil` `:column` and `:value`, and only one breakout (that named by `column-name`, the column of
  the legend) is listed."
  [test-case column-name]
  {:column     nil
   :column-ref nil
   :value      nil
   :dimensions (filter #(= (:name (:column %)) column-name) (dimensions test-case))})

;; Pivot clicks have a value of :null (that is, SQL NULL) and no column, and with dimensions.
(defn pivot-click
  "Given a test case, returns a drill-thru context for a click on a pivot table cell.

  Such a context has `:value :null` but no column, and the dimensions are populated for that pivot row."
  [test-case]
  {:column     nil
   :column-ref nil
   :value      :null
   :dimensions (dimensions test-case)})

(defn- canned-queries
  ([] (canned-queries meta/metadata-provider))
  ([metadata-provider]
   {:test.query/orders
    {:query          (lib/query metadata-provider (meta/table-metadata :orders))
     :row            {"ID"         "3"
                      "USER_ID"    "1"
                      "PRODUCT_ID" "105"
                      "SUBTOTAL"   52.723521442619514
                      "TAX"        2.9
                      "TOTAL"      49.206842233769756
                      "DISCOUNT"   nil
                      "CREATED_AT" "2025-12-06T22:22:48.544+02:00"
                      "QUANTITY"   2}
     :aggregations   0
     :breakouts      0}

    :test.query/orders-count
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count)))
     :row            {"count" 77}
     :aggregations   1
     :breakouts      0
     :default-column "count"}

    :test.query/orders-by-product-id
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/breakout (meta/field-metadata :orders :product-id)))
     :row            {"PRODUCT_ID" 77}
     :aggregations   0
     :breakouts      1
     :default-column "PRODUCT_ID"}

    :test.query/orders-count-by-product-id
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count))
                         (lib/breakout (meta/field-metadata :orders :product-id)))
     :row            {"PRODUCT_ID" 77
                      "count"      3}
     :aggregations   1
     :breakouts      1
     :default-column "PRODUCT_ID"}

    :test.query/orders-count-by-created-at
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count))
                         (lib/breakout (meta/field-metadata :orders :created-at)))
     :row            {"CREATED_AT" "2022-12-01T00:00:00+02:00"
                      "count"      3}
     :aggregations   1
     :breakouts      1
     :default-column "CREATED_AT"}

    :test.query/orders-count-by-created-at-and-product-category
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count))
                         (lib/breakout (meta/field-metadata :orders :created-at))
                         (lib/breakout (meta/field-metadata :products :category)))
     :row            {"CREATED_AT" "2022-12-01T00:00:00+02:00"
                      "CATEGORY"   "Doohickey"
                      "count"      3}
     :aggregations   1
     :breakouts      2
     :default-column "CREATED_AT"}

    :test.query/orders-sum-subtotal-by-product-id
    {:query          (-> (lib/query metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/sum (meta/field-metadata :orders :subtotal)))
                         (lib/breakout (meta/field-metadata :orders :product-id)))
     :row            {"PRODUCT_ID" 77
                      "sum"        986.34}
     :aggregations   1
     :breakouts      1
     :default-column "PRODUCT_ID"}

    :test.query/products
    {:query          (lib/query metadata-provider (meta/table-metadata :products))
     :row            {"ID"         "3"
                      "EAN"        "4966277046676"
                      "TITLE"      "Synergistic Granite Chair"
                      "CATEGORY"   "Doohickey"
                      "VENDOR"     "Murray, Watsica and Wunsch"
                      "PRICE"      35.38
                      "RATING"     4
                      "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}
     :aggregations    0
     :breakouts       0}

    :test.query/products-native
    {:query          (-> (lib/native-query metadata-provider "SELECT * FROM products")
                         (assoc-in [:stages 0 :lib/stage-metadata]
                                   {:lib/type :metadata/results
                                    :columns (->> (meta/fields :products)
                                                  (map #(meta/field-metadata :products %))
                                                  (sort-by :position)
                                                  (map #(select-keys % [:lib/type :name :display-name :field-ref
                                                                        :base-type :effective-type :semantic-type])))}))
     :native?        true
     :row            {"ID"         "3"
                      "EAN"        "4966277046676"
                      "TITLE"      "Synergistic Granite Chair"
                      "CATEGORY"   "Doohickey"
                      "VENDOR"     "Murray, Watsica and Wunsch"
                      "PRICE"      35.38
                      "RATING"     4
                      "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}
     :aggregations    0
     :breakouts       0}

    :test.query/reviews
    {:query          (lib/query metadata-provider (meta/table-metadata :reviews))
     :row            {"ID"         "301"
                      "REVIEWER"   "J. Some Guy"
                      "BODY"       "I think this product is terrible! It solved my problem perfectly but arrived late."
                      "RATING"     3
                      ; This doesn't appear in the sample data, but a NULL FK is useful for testing some drills.
                      "PRODUCT_ID" nil
                      "CREATED_AT" "2024-09-08T22:03:20.239+03:00"}
     :aggregations    0
     :breakouts       0}

    :test.query/people
    {:query          (lib/query metadata-provider (meta/table-metadata :people))
     :row            {"ID"         "222"
                      "NAME"       "J. Some Guy"
                      "EMAIL"      "someguy@isp.com"
                      "PASSWORD"   "eafc45bf-cf8e-4c96-ab35-ce44d0021597"
                      "ADDRESS"    "2112 Rush St"
                      "CITY"       "Portland"
                      "STATE"      "ME"
                      "ZIP"        "66223"
                      "LATITUDE"   43.6307309
                      "LONGITUDE"  -70.8311294
                      "SOURCE"     "Facebook"
                      "BIRTH_DATE" "1987-06-14T00:00:00Z"
                      "CREATED_AT" "2024-09-08T22:03:20.239-04:00"}
     :aggregations    0
     :breakouts       0}}))

(defn returned "Given a test case, a context, and a target drill type (eg. `:drill-thru/quick-filter`), calls
  [[lib/available-drill-thrus]] and looks for the specified drill.
  Either returns the drill itself or nil if it can't be found.

  Intended to be used as `(is (returned ...))` or `(is (not (returned ...)))`, though since it returns the whole drill
  it's possible to check the returned drill more deeply with `(is (=? {...} (returned ...)))`."
  [test-case context drill]
  (let [drills  (lib/available-drill-thrus (:query test-case) -1 context)
        by-type (m/index-by :type drills)]
    (get by-type drill)))

(defn test-case
  "Given a query's key from the [[canned-queries]] map, returns a `test-case` with an instance of that query.

  If a `metadata-provider` is given, uses that; otherwise uses the default [[meta/metadata-provider]]."
  ([query-key] (test-case meta/metadata-provider query-key))
  ([metadata-provider query-key]
   (let [queries (canned-queries metadata-provider)]
     (get queries query-key))))

(defn- click [tc click-type column-name column-kind column-type]
  (let [context (case click-type
                  :cell   (cell-click tc column-name)
                  :header (header-click tc column-name)
                  :legend (legend-click tc column-name)
                  :pivot  (pivot-click tc))]
    [tc context {:click       click-type
                 :column-name column-name
                 :column-kind column-kind
                 :column-type column-type}]))

(defn canned-clicks
  "Given an optional `metadata-provider`, returns a list of `[test-case context details]` triples for a standard set of
  interesting clicks. This helps to factor the basic tests for each drill that it appears in the contexts where it is
  supposed to, and no others.

  The `details` map contains `:column-name` of course, but also some other interesting fields:
  - `:click` is one of `:cell`, `:header`, `:pivot`, and `:legend`.
  - `:cell-kind` is one of `:basic`, `:aggregation` or `:breakout`.
  - `:cell-type` is one of `:pk`, `:fk`, `:string`, `:number`, `:datetime`."
  ([] (canned-clicks meta/metadata-provider))
  ([metadata-provider]
   (->> [;; Basic query for Orders, no aggregations or breakouts - cell and header clicks on different column types.
         (let [tc (test-case metadata-provider :test.query/orders)]
           [(click tc :cell "ID"         :basic :pk)
            (click tc :cell "PRODUCT_ID" :basic :fk)
            (click tc :cell "SUBTOTAL"   :basic :number)
            (click tc :cell "CREATED_AT" :basic :datetime)

            (click tc :header "ID"         :basic :pk)
            (click tc :header "PRODUCT_ID" :basic :fk)
            (click tc :header "SUBTOTAL"   :basic :number)
            (click tc :header "CREATED_AT" :basic :datetime)])

         ;; Singular aggregation for Orders, just clicking that single cell.
         [(click (test-case metadata-provider :test.query/orders-count) :cell "count" :aggregation :number)]

         ;; Breakout-only for Orders by Product ID - click both cell and header.
         (let [tc (test-case metadata-provider :test.query/orders-by-product-id)]
           [(click tc :cell "PRODUCT_ID" :breakout    :fk)

            (click tc :header "PRODUCT_ID" :breakout    :fk)])

         ;; Count broken out by Product ID - click both count and Product ID, both the cells and headers; also a pivot.
         (let [tc (test-case metadata-provider :test.query/orders-count-by-product-id)]
           [(click tc :cell "count"      :aggregation :number)
            (click tc :cell "PRODUCT_ID" :breakout    :fk)

            (click tc :header "count"      :aggregation :number)
            (click tc :header "PRODUCT_ID" :breakout    :fk)

            (click tc :pivot  nil          :basic       :number)])

         ;; Count broken out by Created At - click both count and Created At, both the cells and headers; also a pivot.
         (let [tc (test-case metadata-provider :test.query/orders-count-by-created-at)]
           [(click tc :cell "count"      :aggregation :number)
            (click tc :cell "CREATED_AT" :breakout    :datetime)

            (click tc :header "count"      :aggregation :number)
            (click tc :header "CREATED_AT" :breakout    :datetime)

            (click tc :pivot  nil          :basic       :number)])

         ;; SUM(Subtotal) broken out by Product ID - same as the count case above.
         (let [tc (test-case metadata-provider :test.query/orders-sum-subtotal-by-product-id)]
           [(click tc :cell "sum"        :aggregation :number)
            (click tc :cell "PRODUCT_ID" :breakout    :fk)

            (click tc :header "sum"        :aggregation :number)
            (click tc :header "PRODUCT_ID" :breakout    :fk)

            (click tc :pivot  nil          :basic       :number)])

         ;; Count broken out by both Created At and Product.CATEGORY
         ;; Click all three cells and headers, also a legend click on a category.
         (let [tc (test-case metadata-provider :test.query/orders-count-by-created-at-and-product-category)]
           [(click tc :cell "count"      :aggregation :number)
            (click tc :cell "CREATED_AT" :breakout    :datetime)
            (click tc :cell "CATEGORY"   :breakout    :string)

            (click tc :header "count"      :aggregation :number)
            (click tc :header "CREATED_AT" :breakout    :datetime)
            (click tc :header "CATEGORY"   :breakout    :string)

            (click tc :legend  "CATEGORY"  :breakout    :string)])

         ;; Simple query against Products.
         (let [tc (test-case metadata-provider :test.query/products)]
           [(click tc :cell "ID"         :basic :pk)
            (click tc :cell "EAN"        :basic :string)
            (click tc :cell "TITLE"      :basic :string)
            (click tc :cell "PRICE"      :basic :number)
            (click tc :cell "RATING"     :basic :number)
            (click tc :cell "CREATED_AT" :basic :datetime)

            (click tc :header "ID"         :basic :pk)
            (click tc :header "EAN"        :basic :string)
            (click tc :header "TITLE"      :basic :string)
            (click tc :header "PRICE"      :basic :number)
            (click tc :header "RATING"     :basic :number)
            (click tc :header "CREATED_AT" :basic :datetime)])

         ;; Native query against products
         (let [tc (test-case metadata-provider :test.query/products-native)]
           [(click tc :cell "ID"         :basic :pk)
            (click tc :cell "EAN"        :basic :string)
            (click tc :cell "TITLE"      :basic :string)
            (click tc :cell "PRICE"      :basic :number)
            (click tc :cell "RATING"     :basic :number)
            (click tc :cell "CREATED_AT" :basic :datetime)

            (click tc :header "ID"         :basic :pk)
            (click tc :header "EAN"        :basic :string)
            (click tc :header "TITLE"      :basic :string)
            (click tc :header "PRICE"      :basic :number)
            (click tc :header "RATING"     :basic :number)
            (click tc :header "CREATED_AT" :basic :datetime)])

         ;; Simple query against Reviews.
         ;; This one has a :type/Description column (BODY) which matters for Distribution drills.
         (let [tc (test-case metadata-provider :test.query/reviews)]
           [(click tc :cell "ID"         :basic :pk)
            (click tc :cell "REVIEWER"   :basic :string)
            (click tc :cell "BODY"       :basic :string)
            (click tc :cell "RATING"     :basic :number)
            (click tc :cell "PRODUCT_ID" :basic :fk)
            (click tc :cell "CREATED_AT" :basic :datetime)

            (click tc :header "ID"         :basic :pk)
            (click tc :header "REVIEWER"   :basic :string)
            (click tc :header "BODY"       :basic :string)
            (click tc :header "RATING"     :basic :number)
            (click tc :header "PRODUCT_ID" :basic :fk)
            (click tc :header "CREATED_AT" :basic :datetime)])

         ;; Simple query against People.
         ;; This one has a :type/Email (EMAIL) for Column Extract drills.
         (let [tc (test-case metadata-provider :test.query/people)]
           [(click tc :cell "ID"         :basic :pk)
            (click tc :cell "ADDRESS"    :basic :string)
            (click tc :cell "EMAIL"      :basic :string)
            (click tc :cell "PASSWORD"   :basic :string)
            (click tc :cell "NAME"       :basic :string)
            (click tc :cell "CITY"       :basic :string)
            (click tc :cell "STATE"      :basic :string)
            (click tc :cell "ZIP"        :basic :string)
            (click tc :cell "LATITUDE"   :basic :number)
            (click tc :cell "LONGITUDE"  :basic :number)
            (click tc :cell "SOURCE"     :basic :string)
            (click tc :cell "BIRTH_DATE" :basic :datetime)
            (click tc :cell "CREATED_AT" :basic :datetime)

            (click tc :header "ID"         :basic :pk)
            (click tc :header "ADDRESS"    :basic :string)
            (click tc :header "EMAIL"      :basic :string)
            (click tc :header "PASSWORD"   :basic :string)
            (click tc :header "NAME"       :basic :string)
            (click tc :header "CITY"       :basic :string)
            (click tc :header "STATE"      :basic :string)
            (click tc :header "ZIP"        :basic :string)
            (click tc :header "LATITUDE"   :basic :number)
            (click tc :header "LONGITUDE"  :basic :number)
            (click tc :header "SOURCE"     :basic :string)
            (click tc :header "BIRTH_DATE" :basic :datetime)
            (click tc :header "CREATED_AT" :basic :datetime)])

         ;; Simple query against Products, but it lies!
         ;; Claims VENDOR is :type/SerializedJSON (derives from :type/Structured).
         (let [tc (-> metadata-provider
                      (merged-mock/merged-mock-metadata-provider
                       {:fields [{:id            (meta/id :products :vendor)
                                  :semantic-type :type/SerializedJSON}]})
                      (test-case :test.query/products))]
           [(click tc :cell   "VENDOR" :basic :string)
            (click tc :header "VENDOR" :basic :string)])

         ;; Simple query against People, but it lies!
         ;; Claims EMAIL is :type/URL (relevant to Column Extract drills).
         (let [tc (-> metadata-provider
                      (merged-mock/merged-mock-metadata-provider
                       {:fields [{:id            (meta/id :people :email)
                                  :semantic-type :type/URL}]})
                      (test-case :test.query/people))]
           [(click tc :cell   "EMAIL" :basic :string)
            (click tc :header "EMAIL" :basic :string)])]
        (apply concat))))

(defn canned-test
  "Given a drill type (eg. `:drill-thru/fk-filter`) and a `pred` function, calls
  `(pred test-case context click-details)`. If the predicate is truthy, expects that drill to be returned, and not to be
  returned if falsy.

  The special value `::skip` can be returned to ignore a test case altogether."
  ([drill pred]
   (canned-test drill pred (canned-clicks)))
  ([drill pred clicks]
   (doseq [[tc context click-details] clicks
           :let [exp? (pred tc context click-details)]
           :when (not= exp? ::skip)]
     (testing (str "Should " (when-not exp? "not ") "return " drill " when:"
                   "\nTest case = \n" (u/pprint-to-str tc)
                   "\nContext = \n"   (u/pprint-to-str context)
                   "\nClick = \n"     (u/pprint-to-str click))
       (is (=? (when exp?
                 {:type drill})
               (returned tc context drill)))))))
