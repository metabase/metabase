(ns metabase.pulse.test-util
  (:require
   [medley.core :as m]
   [metabase.channel.core :as channel]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def card-name "Test card")

(defn checkins-query-card*
  "Basic query that will return results for an alert"
  [query-map]
  {:name          card-name
   :dataset_query query-map})

(defmacro checkins-query-card [query]
  `(checkins-query-card* (mt/mbql-query ~'checkins ~(merge {:aggregation [["count"]]} query))))

(defn venues-query-card [aggregation-op]
  {:name          card-name
   :dataset_query (mt/mbql-query venues
                    {:aggregation  [[aggregation-op $price]]})})

(defn rasta-id []
  (mt/user->id :rasta))

(defn do-with-site-url!
  [thunk]
  (mt/with-temporary-setting-values [site-url "https://testmb.com"]
    (thunk)))

(defmacro email-test-setup!
  "Macro that ensures test-data is present and will use a fake inbox for emails"
  [& body]
  `(mt/with-fake-inbox
     (do-with-site-url! (fn [] ~@body))))

(defmacro slack-test-setup!
  "Macro that ensures test-data is present and disables sending of all notifications"
  [& body]
  `(with-redefs [channel/send!       (constantly :noop)]
     (do-with-site-url! (fn [] ~@body))))

(defmacro with-captured-channel-send-messages!
  [& body]
  `(notification.tu/with-captured-channel-send!
     ~@body))

(def png-attachment
  {:type         :inline
   :content-id   true
   :content-type "image/png"
   :content      java.net.URL})

(def csv-attachment
  {:type         :attachment
   :content-type "text/csv"
   :file-name    "Test card.csv",
   :content      java.net.URL
   :description  "More results for 'Test card'"
   :content-id   false})

(def xls-attachment
  {:type         :attachment
   :file-name    "Test card.xlsx"
   :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :content      java.net.URL
   :description  "More results for 'Test card'"
   :content-id   false})

(defprotocol WrappedFunction
  (input [_])
  (output [_]))

(defn- invoke-with-wrapping
  "Apply `args` to `func`, capturing the arguments of the invocation and the result of the invocation. Store the
  arguments in `input-atom` and the result in `output-atom`."
  [input-atom output-atom func args]
  (swap! input-atom conj args)
  (let [result (apply func args)]
    (swap! output-atom conj result)
    result))

(defn wrap-function
  "Return a function that wraps `func`, not interfering with it but recording it's input and output, which is
  available via the `input` function and `output`function that can be used directly on this object"
  [func]
  (let [input (atom nil)
        output (atom nil)]
    (reify WrappedFunction
      (input [_] @input)
      (output [_] @output)
      clojure.lang.IFn
      (invoke [_ x1]
        (invoke-with-wrapping input output func [x1]))
      (invoke [_ x1 x2]
        (invoke-with-wrapping input output func [x1 x2]))
      (invoke [_ x1 x2 x3]
        (invoke-with-wrapping input output func [x1 x2 x3]))
      (invoke [_ x1 x2 x3 x4]
        (invoke-with-wrapping input output func [x1 x2 x3 x4]))
      (invoke [_ x1 x2 x3 x4 x5]
        (invoke-with-wrapping input output func [x1 x2 x3 x4 x5]))
      (invoke [_ x1 x2 x3 x4 x5 x6]
        (invoke-with-wrapping input output func [x1 x2 x3 x4 x5 x6])))))

(defn thunk->boolean [{:keys [attachments] :as result}]
  (assoc result :attachments (for [attachment-info attachments]
                               (if (:rendered-info attachment-info)
                                 (update attachment-info
                                         :rendered-info
                                         (fn [ri] (m/map-vals some? ri)))
                                 attachment-info))))

(def test-dashboard
  "A test dashboard with only the :parameters field included, for testing that dashboard filters
  render correctly in Slack messages and emails"
  {:parameters
   [{:name "State",
     :slug "state",
     :id "63e719d0",
     :default ["CA", "NY", "NJ"],
     :type "string/=",
     :sectionId "location"}
    {:name "Quarter and Year",
     :slug "quarter_and_year",
     :id "a6db3d8b",
     :default "Q1-2021"
     :type "date/quarter-year",
     :sectionId "date"}
    ;; Filter without default, should not be included in subscription
    {:name "Product title contains",
     :slug "product_title_contains",
     :id "acd0dfab",
     :type "string/contains",
     :sectionId "string"}]})
