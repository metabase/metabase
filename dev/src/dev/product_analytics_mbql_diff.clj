(ns dev.product-analytics-mbql-diff
  "Checks the product analytics MBQL planners against the string planners: for each variant
  `dev/product-analytics/mbql-variants.ts` wrote, runs the string planner's SQL and the MBQL query through the query
  processor and compares their rows, ignoring order. Weeks start on Monday, as the string planners' do.

    bun run dev/product-analytics/mbql-variants.ts
    (dev.product-analytics-mbql-diff/diff)              ; every variant with an MBQL query
    (dev.product-analytics-mbql-diff/diff :only \"habit\")"
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(def ^:private variants-file "dev/product-analytics/.mbql/variants.json")

(defn- run [database-id query]
  (try
    (let [mp     (lib-be/application-database-metadata-provider database-id)
          query  (if (string? query)
                   (lib/native-query mp query)
                   (lib-be/normalize-query mp query))
          result (request/as-admin (qp/process-query query))]
      (if (= :completed (:status result))
        {:cols (mapv :name (-> result :data :cols)), :rows (-> result :data :rows)}
        {:error (:error result)}))
    (catch Throwable e
      {:error (ex-message e)})))

(defn- normalize-value
  "Values the two queries return in different forms: numbers to 6 decimal places, and dates or datetimes as naive
  ISO datetimes."
  [v]
  (cond
    (number? v)                                            (let [d (double v)]
                                                             (if (== d (Math/rint d))
                                                               (long d)
                                                               (/ (Math/rint (* d 1e6)) 1e6)))
    (and (string? v) (re-matches #"\d{4}-\d\d-\d\d" v))    (str v "T00:00:00")
    (and (string? v) (re-matches #"\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d.*" v)) (str/replace (subs v 0 19) " " "T")
    :else                                                  v))

(defn- row-bag [{:keys [cols rows]}]
  (frequencies (map #(zipmap cols (map normalize-value %)) rows)))

(defn- compare-variant [{variant-name :name, :keys [database sql mbql]}]
  (let [database (or database 2)
        expected (run database sql)
        actual   (run database mbql)]
    (merge
     {:name variant-name}
     (cond
       (:error actual)                               {:status :mbql-error, :error (:error actual)}
       (:error expected)                             {:status :sql-error, :error (:error expected)}
       (not= (set (:cols expected)) (set (:cols actual))) {:status :columns, :sql (:cols expected), :mbql (:cols actual)}
       (= (row-bag expected) (row-bag actual))      {:status :match, :rows (count (:rows expected))}
       :else
       (let [expected-rows (row-bag expected)
             actual-rows   (row-bag actual)]
         {:status    :rows
          :sql-rows  (count (:rows expected))
          :mbql-rows (count (:rows actual))
          :only-sql  (take 3 (remove actual-rows (keys expected-rows)))
          :only-mbql (take 3 (remove expected-rows (keys actual-rows)))})))))

(defn diff
  "Compares each variant that has an MBQL query, or those whose names start with `only`."
  [& {:keys [only]}]
  (mt/with-temporary-setting-values [start-of-week :monday]
    (into []
          (comp (filter :mbql)
                (filter #(or (nil? only) (str/starts-with? (:name %) only)))
                (map compare-variant))
          (json/decode+kw (slurp variants-file)))))
