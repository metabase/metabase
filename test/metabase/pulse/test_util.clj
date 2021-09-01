(ns metabase.pulse.test-util
  (:require [clojure.walk :as walk]
            [metabase.integrations.slack :as slack]
            [metabase.models.pulse :as models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.pulse :as pulse]
            [metabase.query-processor-test :as qp.test]
            [metabase.test :as mt]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(defn send-pulse-created-by-user!
  "Create a Pulse with `:creator_id` of `user-kw`, and simulate sending it, executing it and returning the results."
  [user-kw card]
  (tt/with-temp* [Pulse      [pulse {:creator_id (users/user->id user-kw)}]
                  PulseCard  [_ {:pulse_id (:id pulse), :card_id (u/the-id card)}]]
    (with-redefs [pulse/send-notifications!    identity
                  pulse/results->notifications (fn [_ results]
                                                 (vec results))]
      (let [[{:keys [result]}] (pulse/send-pulse! pulse)]
        (qp.test/rows result)))))


(def card-name "Test card")

(defn checkins-query-card*
  "Basic query that will return results for an alert"
  [query-map]
  {:name          card-name
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    (merge {:source-table (mt/id :checkins)
                                     :aggregation  [["count"]]}
                                    query-map)}})

(defmacro checkins-query-card [query]
  `(checkins-query-card* (mt/$ids ~'checkins ~query)))

(defn venues-query-card [aggregation-op]
  {:name          card-name
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :venues)
                              :aggregation  [[aggregation-op (mt/id :venues :price)]]}}})

(defn rasta-id []
  (mt/user->id :rasta))

(defn realize-lazy-seqs
  "It's possible when data structures contain lazy sequences that the database will be torn down before the lazy seq
  is realized, causing the data returned to be nil. This function walks the datastructure, realizing all the lazy
  sequences it finds"
  [data]
  (walk/postwalk identity data))

(defn do-with-site-url
  [f]
  (mt/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
    (f)))

(defmacro email-test-setup
  "Macro that ensures test-data is present and will use a fake inbox for emails"
  [& body]
  `(mt/with-fake-inbox
     (do-with-site-url (fn [] ~@body))))

(defmacro slack-test-setup
  "Macro that ensures test-data is present and disables sending of all notifications"
  [& body]
  `(with-redefs [metabase.pulse/send-notifications! realize-lazy-seqs
                 slack/files-channel                (constantly {:name "metabase_files"
                                                                 :id   "FOO"})]
     (do-with-site-url (fn [] ~@body))))


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

(defn force-bytes-thunk
  "Grabs the thunk that produces the image byte array and invokes it"
  [results]
  ((-> results
       :attachments
       first
       :attachment-bytes-thunk)))

(defn thunk->boolean [{:keys [attachments] :as result}]
  (assoc result :attachments (for [attachment-info attachments]
                               (update attachment-info :attachment-bytes-thunk fn?))))
