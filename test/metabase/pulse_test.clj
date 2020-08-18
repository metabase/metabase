(ns metabase.pulse-test
  (:require [clojure
             [string :as str]
             [test :refer :all]
             [walk :as walk]]
            [clojure.java.io :as io]
            [medley.core :as m]
            [metabase
             [models :refer [Card Collection Pulse PulseCard PulseChannel PulseChannelRecipient]]
             [pulse :as pulse]
             [test :as mt]
             [util :as u]]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :as models.pulse]]
            [metabase.pulse.render.body :as render.body]
            [metabase.pulse.test-util :as pulse.tu]
            [metabase.query-processor.middleware.constraints :as constraints]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Util Fns & Macros                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private card-name "Test card")

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

(defn- venues-query-card [aggregation-op]
  {:name          card-name
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :venues)
                              :aggregation  [[aggregation-op (mt/id :venues :price)]]}}})

(defn- rasta-id []
  (mt/user->id :rasta))

(defn- realize-lazy-seqs
  "It's possible when data structures contain lazy sequences that the database will be torn down before the lazy seq
  is realized, causing the data returned to be nil. This function walks the datastructure, realizing all the lazy
  sequences it finds"
  [data]
  (walk/postwalk identity data))

(defn- do-with-site-url
  [f]
  (mt/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
    (f)))

(defmacro ^:private slack-test-setup
  "Macro that ensures test-data is present and disables sending of all notifications"
  [& body]
  `(with-redefs [metabase.pulse/send-notifications! realize-lazy-seqs
                 slack/files-channel                (constantly {:name "metabase_files"
                                                                 :id   "FOO"})]
     (do-with-site-url (fn [] ~@body))))

(defmacro ^:private email-test-setup
  "Macro that ensures test-data is present and will use a fake inbox for emails"
  [& body]
  `(mt/with-fake-inbox
     (do-with-site-url (fn [] ~@body))))

(defn- do-with-pulse-for-card
  "Creates a Pulse and other relevant rows for a `card` (using `pulse` and `pulse-card` properties if specfied), then
  invokes

    (f pulse)"
  [{:keys [pulse pulse-card channel card]
    :or   {channel :email}}
   f]
  (mt/with-temp* [Pulse                 [{pulse-id :id, :as pulse} (merge {:name "Pulse Name"} pulse)]
                  PulseCard             [_ (merge {:pulse_id pulse-id
                                                   :card_id  (u/get-id card)
                                                   :position 0}
                                                  pulse-card)]
                  PulseChannel          [{pc-id :id} (case channel
                                                       :email
                                                       {:pulse_id pulse-id}

                                                       :slack
                                                       {:pulse_id     pulse-id
                                                        :channel_type "slack"
                                                        :details      {:channel "#general"}})]]
    (if (= channel :email)
      (mt/with-temp PulseChannelRecipient [_ {:user_id          (rasta-id)
                                              :pulse_channel_id pc-id}]
        (f pulse))
      (f pulse))))

(defmacro ^:private with-pulse-for-card
  "e.g.

    (with-pulse-for-card [pulse {:card my-card, :pulse pulse-properties, ...}]
      ...)"
  [[pulse-binding properties] & body]
  `(do-with-pulse-for-card ~properties (fn [~pulse-binding] ~@body)))

(defn- do-test
  "Run a single Pulse test with a standard set of boilerplate. Creates Card, Pulse, and other related objects using
  `card`, `pulse`, and `pulse-card` properties, then sends the Pulse; finally, test assertions in `assert` are
  invoked. `assert` can contain `:email` and/or `:slack` assertions, which are used to test an email and Slack version
  of that Pulse respectively. `:assert` functions have the signature

    (f object-ids send-pulse!-response)

  Example:

    (do-test
     {:card   {:dataset_query (mt/mbql-query checkins)}
      :assert {:slack (fn [{:keys [pulse-id]} response]
                        (is (= {:sent pulse-id}
                               response)))}})"
  [{:keys [card pulse pulse-card fixture], assertions :assert}]
  {:pre [(map? assertions) ((some-fn :email :slack) assertions)]}
  (doseq [channel-type [:email :slack]
          :let         [f (get assertions channel-type)]
          :when        f]
    (assert (fn? f))
    (testing (format "sent to %s channel" channel-type)
      (mt/with-temp Card [{card-id :id} (merge {:name card-name} card)]
        (with-pulse-for-card [{pulse-id :id} {:card card-id, :pulse pulse, :pulse-card pulse-card, :channel channel-type}]
          (letfn [(thunk* []
                    (f {:card-id card-id, :pulse-id pulse-id}
                       (pulse/send-pulse! (models.pulse/retrieve-notification pulse-id))))
                  (thunk []
                    (if fixture
                      (fixture {:card-id card-id, :pulse-id pulse-id} thunk*)
                      (thunk*)))]
            (case channel-type
              :email (email-test-setup (thunk))
              :slack (slack-test-setup (thunk)))))))))

(defn- tests
  "Convenience for writing multiple tests using `do-test`. `common` is a map of shared properties as passed to `do-test`
  that is deeply merged with the individual maps for each test. Other args are alternating `testing` context messages
  and properties as passed to `do-test`:

    (tests
     ;; shared properties used for both tests
     {:card {:dataset_query (mt/mbql-query)}}

     \"Test 1\"
     {:assert {:email (fn [_ _] (is ...))}}

     \"Test 2\"
     ;; override just the :display property of the Card
     {:card   {:display \"table\"}
      :assert {:email (fn [_ _] (is ...))}})"
  {:style/indent 1}
  [common & {:as message->m}]
  (doseq [[message m] message->m]
    (testing message
      (do-test (merge-with merge common m)))))

(defn- force-bytes-thunk
  "Grabs the thunk that produces the image byte array and invokes it"
  [results]
  ((-> results
       :attachments
       first
       :attachment-bytes-thunk)))

(def ^:private png-attachment
  {:type         :inline
   :content-id   true
   :content-type "image/png"
   :content      java.net.URL})

(defn- rasta-pulse-email [& [email]]
  (mt/email-to :rasta (merge {:subject "Pulse: Pulse Name",
                              :body  [{"Pulse Name" true}
                                      png-attachment]}
                             email)))

(def ^:private csv-attachment
  {:type         :attachment
   :content-type "text/csv"
   :file-name    "Test card.csv",
   :content      java.net.URL
   :description  "More results for 'Test card'"
   :content-id   false})

(def ^:private xls-attachment
  {:type         :attachment
   :file-name    "Test card.xlsx"
   :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
   :content      java.net.URL
   :description  "More results for 'Test card'"
   :content-id   false})

(defn- rasta-alert-email
  [subject email-body]
  (mt/email-to :rasta {:subject subject
                       :body email-body}))

(def ^:private test-card-result {card-name true})
(def ^:private test-card-regex  (re-pattern card-name))

(defn- thunk->boolean [{:keys [attachments] :as result}]
  (assoc result :attachments (for [attachment-info attachments]
                               (update attachment-info :attachment-bytes-thunk fn?))))

(defprotocol ^:private WrappedFunction
  (^:private input [_])
  (^:private output [_]))

(defn- invoke-with-wrapping
  "Apply `args` to `func`, capturing the arguments of the invocation and the result of the invocation. Store the
  arguments in `input-atom` and the result in `output-atom`."
  [input-atom output-atom func args]
  (swap! input-atom conj args)
  (let [result (apply func args)]
    (swap! output-atom conj result)
    result))

(defn- wrap-function
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

(defn- produces-bytes? [{:keys [attachment-bytes-thunk]}]
  (pos? (alength ^bytes (attachment-bytes-thunk))))

(defn- email-body? [{message-type :type, ^String content :content}]
  (and (= "text/html; charset=utf-8" message-type)
       (string? content)
       (.startsWith content "<html>")))

(defn- attachment? [{message-type :type, content-type :content-type, content :content}]
  (and (= :inline message-type)
       (= "image/png" content-type)
       (instance? java.net.URL content)))

(defn- add-rasta-attachment
  "Append `attachment` to the first email found for Rasta"
  [email attachment]
  (update-in email ["rasta@metabase.com" 0] #(update % :body conj attachment)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Tests                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest basic-timeseries-test
  (do-test
   {:card  (checkins-query-card {:breakout [!hour.date]})
    :pulse {:skip_if_empty false}

    :assert
    {:email
     (fn [_ _]
       (is (= (rasta-pulse-email)
              (mt/summarize-multipart-email #"Pulse Name"))))

     :slack
     (fn [{:keys [card-id]} [pulse-results]]
       (is (= {:channel-id "#general"
               :message    "Pulse: Pulse Name"
               :attachments
               [{:title                  card-name
                 :attachment-bytes-thunk true
                 :title_link             (str "https://metabase.com/testmb/question/" card-id)
                 :attachment-name        "image.png"
                 :channel-id             "FOO"
                 :fallback               card-name}]}
              (thunk->boolean pulse-results))))}}))

(deftest basic-table-test
  (tests {:pulse {:skip_if_empty false}}
    "19 results, so no attachment"
    {:card (checkins-query-card {:aggregation nil, :limit 19})

     :fixture
     (fn [_ thunk]
       (with-redefs [render.body/attached-results-text (wrap-function @#'render.body/attached-results-text)]
         (thunk)))

     :assert
     {:email
      (fn [_ _]
        (is (= (rasta-pulse-email {:body [{"Pulse Name"                      true
                                           "More results have been included" false
                                           "ID</th>"                         true}]})
               (mt/summarize-multipart-email
                #"Pulse Name"
                #"More results have been included" #"ID</th>"))))

      :slack
      (fn [{:keys [card-id]} [pulse-results]]
        ;; If we don't force the thunk, the rendering code will never execute and attached-results-text won't be
        ;; called
        (force-bytes-thunk pulse-results)
        (testing "\"more results in attachment\" text should not be present for Slack Pulses"
          (testing "Pulse results"
            (is (= {:channel-id "#general"
                    :message    "Pulse: Pulse Name"
                    :attachments
                    [{:title                  card-name
                      :attachment-bytes-thunk true
                      :title_link             (str "https://metabase.com/testmb/question/" card-id)
                      :attachment-name        "image.png"
                      :channel-id             "FOO"
                      :fallback               card-name}]}
                   (thunk->boolean pulse-results))))
          (testing "attached-results-text should be invoked exactly once"
            (is (= 1
                   (count (input @#'render.body/attached-results-text)))))
          (testing "attached-results-text should return nil since it's a slack message"
            (is (= [nil]
                   (output @#'render.body/attached-results-text))))))}}

    "21 results results in a CSV being attached and a table being sent"
    {:card (checkins-query-card {:aggregation nil, :limit 21})

     :assert
     {:email
      (fn [_ _]
        (is (= (rasta-pulse-email {:body [{"Pulse Name"                      true
                                           "More results have been included" true
                                           "ID</th>"                         true}
                                          csv-attachment]})
               (mt/summarize-multipart-email
                #"Pulse Name"
                #"More results have been included" #"ID</th>"))))}}))

(deftest csv-test
  (tests {:pulse {:skip_if_empty false}
          :card  (checkins-query-card {:breakout [!hour.date]})})
  "1 card, 1 recipient, with CSV attachment"
  {:assert
   {:email
    (fn [_ _]
      (is (= (add-rasta-attachment (rasta-pulse-email) csv-attachment)
             (mt/summarize-multipart-email #"Pulse Name"))))}}

  "alert with a CSV"
  {:pulse-card {:include_csv true}

   :assert
   {:email
    (fn [_ _]
      (is (= (rasta-alert-email "Metabase alert: Test card has results"
                                [test-card-result, png-attachment, csv-attachment])
             (mt/summarize-multipart-email test-card-regex))))}}

  "With a \"rows\" type of pulse (table visualization) we should include the CSV by default"
  {:card {:dataset_query (mt/mbql-query checkins)}

   :assert
   {:email
    (fn [_ _]
      (is (= (-> (rasta-pulse-email)
                 ;; There's no PNG with a table visualization, remove it from the assert results
                 (update-in ["rasta@metabase.com" 0 :body] (comp vector first))
                 (add-rasta-attachment csv-attachment))
             (mt/summarize-multipart-email #"Pulse Name"))))}})

(deftest xls-test
  (testing "If the pulse is already configured to send an XLS, no need to include a CSV"
    (do-test
     {:card       {:dataset_query (mt/mbql-query checkins)}
      :pulse-card {:include_xls true}

      :assert
      {:email
       (fn [_ _]
         (is (= (-> (rasta-pulse-email)
                    ;; There's no PNG with a table visualization, remove it from the assert results
                    (update-in ["rasta@metabase.com" 0 :body] (comp vector first))
                    (add-rasta-attachment xls-attachment))
                (mt/summarize-multipart-email #"Pulse Name"))))}})))

;; Not really sure how this is significantly different from `xls-test`
(deftest xls-test-2
  (testing "Basic test, 1 card, 1 recipient, with XLS attachment"
    (do-test
     {:card       (checkins-query-card {:breakout [!hour.date]})
      :pulse-card {:include_xls true}
      :assert
      {:email
       (fn [_ _]
         (is (= (add-rasta-attachment (rasta-pulse-email) xls-attachment)
                (mt/summarize-multipart-email #"Pulse Name"))))}})))

(deftest csv-xls-no-data-test
  (testing "card with CSV and XLS attachments, but no data. Should not include an attachment"
    (do-test
     {:card       (checkins-query-card {:filter   [:> $date "2017-10-24"]
                                        :breakout [!hour.date]})
      :pulse      {:skip_if_empty false}
      :pulse-card {:include_csv true
                   :include_xls true}
      :assert
      {:email
       (fn [_ _]
         (is (= (rasta-pulse-email)
                (mt/summarize-multipart-email #"Pulse Name"))))}})))

(deftest ensure-constraints-test
  (testing "Validate pulse queries are limited by `default-query-constraints`"
    (do-test
     {:card
      (checkins-query-card {:aggregation nil})

      :fixture
      (fn [_ thunk]
        (with-redefs [constraints/default-query-constraints {:max-results           10000
                                                             :max-results-bare-rows 30}]
          (thunk)))

      :assert
      {:email
       (fn [_ _]
         (let [first-message (-> @mt/inbox vals ffirst)]
           (is (= true
                  (some? first-message))
               "Should have a message in the inbox")
           (when first-message
             (let [filename (-> first-message :body last :content)
                   exists?  (some-> filename io/file .exists)]
               (testing "File should exist"
                 (is (= true
                        exists?)))
               (testing (str "tmp file = %s" filename)
                 (testing "Slurp in the generated CSV and count the lines found in the file"
                   (when exists?
                     (testing "Should return 30 results (the redef'd limit) plus the header row"
                       (is (= 31
                              (-> (slurp filename) str/split-lines count))
                           )))))))))}})))

(deftest multiple-recipients-test
  (testing "Pulse should be sent to two recipients"
    (do-test
     {:card
      (checkins-query-card {:breakout [!hour.date]})

      :fixture
      (fn [{:keys [pulse-id]} thunk]
        (mt/with-temp PulseChannelRecipient [_ {:user_id          (mt/user->id :crowberto)
                                                :pulse_channel_id (db/select-one-id PulseChannel :pulse_id pulse-id)}]
          (thunk)))

      :assert
      {:email
       (fn [_ _]
         (is (= (into {} (map (fn [user-kwd]
                                (mt/email-to user-kwd {:subject "Pulse: Pulse Name",
                                                       :to      #{"rasta@metabase.com" "crowberto@metabase.com"}
                                                       :body    [{"Pulse Name" true}
                                                                 png-attachment]}))
                              [:rasta :crowberto]))
                (mt/summarize-multipart-email #"Pulse Name"))))}})))

(deftest two-cards-in-one-pulse-test
  (testing "1 pulse that has 2 cards, should contain two attachments"
    (do-test
     {:card
      (assoc (checkins-query-card {:breakout [!hour.date]}) :name "card 1")

      :fixture
      (fn [{:keys [pulse-id]} thunk]
        (mt/with-temp* [Card [{card-id-2 :id} (assoc (checkins-query-card {:breakout [!month.date]})
                                                     :name "card 2")]
                        PulseCard [_ {:pulse_id pulse-id
                                      :card_id  card-id-2
                                      :position 1}]]
          (thunk)))

      :assert
      {:email
       (fn [_ _]
         (is (= (rasta-pulse-email {:body [{"Pulse Name" true}
                                           png-attachment
                                           png-attachment]})
                (mt/summarize-multipart-email #"Pulse Name"))))}})))

(deftest empty-results-test
  (testing "Pulse where the card has no results"
    (tests {:card (checkins-query-card {:filter   [:> $date "2017-10-24"]
                                        :breakout [!hour.date]})}
      "skip if empty = false"
      {:pulse    {:skip_if_empty false}
       :assert {:email (fn [_ _]
                           (is (= (rasta-pulse-email)
                                  (mt/summarize-multipart-email #"Pulse Name"))))}}

      "skip if empty = true"
      {:pulse    {:skip_if_empty true}
       :assert {:email (fn [_ _]
                           (is (= {}
                                  (mt/summarize-multipart-email #"Pulse Name"))))}})))

(deftest rows-alert-test
  (testing "Rows alert"
    (tests {:pulse {:alert_condition "rows", :alert_first_only false}}
      "with data"
      {:card
       (checkins-query-card {:breakout [!hour.date]})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email
                  "Metabase alert: Test card has results"
                  [(assoc test-card-result "More results have been included" false)
                   png-attachment])
                 (mt/summarize-multipart-email test-card-regex #"More results have been included"))))

        :slack
        (fn [{:keys [card-id]} [result]]
          (is (= {:channel-id  "#general",
                  :message     "Alert: Test card",
                  :attachments [{:title                  card-name
                                 :attachment-bytes-thunk true
                                 :title_link             (str "https://metabase.com/testmb/question/" card-id)
                                 :attachment-name        "image.png"
                                 :channel-id             "FOO"
                                 :fallback               card-name}]}
                 (thunk->boolean result)))
          (is (every? produces-bytes? (:attachments result))))}}

      "with no data"
      {:card
       (checkins-query-card {:filter   [:> $date "2017-10-24"]
                             :breakout [!hour.date]})
       :assert
       {:email
        (fn [_ _]
          (is (= {}
                 @mt/inbox)))}}

      "too much data"
      {:card
       (checkins-query-card {:limit 21, :aggregation nil})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has results"
                                    [(merge test-card-result
                                            {"More results have been included" true
                                             "ID</th>"                         true})
                                     csv-attachment])
                 (mt/summarize-multipart-email test-card-regex
                                               #"More results have been included"
                                               #"ID</th>"))))}}


      "with data and a CSV + XLS attachment"
      {:card       (checkins-query-card {:breakout [!hour.date]})
       :pulse-card {:include_csv true, :include_xls true}

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has results"
                                    [test-card-result png-attachment csv-attachment xls-attachment])
                 (mt/summarize-multipart-email test-card-regex))))}})))

(deftest alert-first-run-only-test
  (tests {:pulse {:alert_condition "rows", :alert_first_only true}}
    "first run only with data"
    {:card
     (checkins-query-card {:breakout [!hour.date]})

     :assert
     {:email
      (fn [{:keys [pulse-id]} _]
        (is (= (rasta-alert-email "Metabase alert: Test card has results"
                                  [(assoc test-card-result "stop sending you alerts" true)
                                   png-attachment])
               (mt/summarize-multipart-email test-card-regex #"stop sending you alerts")))
        (testing "Pulse should be deleted"
          (is (= false
                 (db/exists? Pulse :id pulse-id)))))}}

    "first run alert with no data"
    {:card
     (checkins-query-card {:filter   [:> $date "2017-10-24"]
                           :breakout [!hour.date]})

     :assert
     {:email
      (fn [{:keys [pulse-id]} _]
        (is (= {}
               @mt/inbox))
        (testing "Pulse should still exist"
          (is (= true
                 (db/exists? Pulse :id pulse-id)))))}}))

(deftest above-goal-alert-test
  (testing "above goal alert"
    (tests {:pulse {:alert_condition  "goal"
                    :alert_first_only false
                    :alert_above_goal true}}
      "with data"
      {:card
       (merge (checkins-query-card {:filter   [:between $date "2014-04-01" "2014-06-01"]
                                    :breakout [!day.date]})
              {:display                :line
               :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has reached its goal"
                                    [test-card-result, png-attachment])
                 (mt/summarize-multipart-email test-card-regex))))}}

      "no data"
      {:card
       (merge (checkins-query-card {:filter   [:between $date "2014-02-01" "2014-04-01"]
                                    :breakout [!day.date]})
              {:display                :area
               :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})

       :assert
       {:email
        (fn [_ _]
          (is (= {}
                 @mt/inbox)))}}

      "with progress bar"
      {:card
       (merge (venues-query-card "max")
              {:display                :progress
               :visualization_settings {:progress.goal 3}})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has reached its goal"
                                    [test-card-result])
                 (mt/summarize-multipart-email test-card-regex))))}})))

(deftest below-goal-alert-test
  (testing "Below goal alert"
    (tests {:card  {:display                :bar
                    :visualization_settings {:graph.show_goal true :graph.goal_value 1.1}}
            :pulse {:alert_condition  "goal"
                    :alert_first_only false
                    :alert_above_goal false}}
      "with data"
      {:card
       (checkins-query-card {:filter   [:between $date "2014-02-12" "2014-02-17"]
                             :breakout [!day.date]})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has gone below its goal"
                                    [test-card-result png-attachment])
                 (mt/summarize-multipart-email test-card-regex))))}}

      "with no satisfying data"
      {:card
       (checkins-query-card {:filter   [:between $date "2014-02-10" "2014-02-12"]
                             :breakout [!day.date]})

       :assert
       {:email
        (fn [_ _]
          (is (= {}
                 @mt/inbox)))}}

      "with progress bar"
      {:card
       (merge (venues-query-card "min")
              {:display                :progress
               :visualization_settings {:progress.goal 2}})

       :assert
       {:email
        (fn [_ _]
          (is (= (rasta-alert-email "Metabase alert: Test card has gone below its goal"
                                    [test-card-result])
                 (mt/summarize-multipart-email test-card-regex))))}})))

(deftest native-query-with-user-specified-axes-test
  (testing "Native query with user-specified x and y axis"
    (mt/with-temp Card [{card-id :id} {:name                   "Test card"
                                       :dataset_query          {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query (str "select count(*) as total_per_day, date as the_day "
                                                                                       "from checkins "
                                                                                       "group by date")}}
                                       :display                :line
                                       :visualization_settings {:graph.show_goal  true
                                                                :graph.goal_value 5.9
                                                                :graph.dimensions ["the_day"]
                                                                :graph.metrics    ["total_per_day"]}}]
      (with-pulse-for-card [{pulse-id :id} {:card card-id, :pulse {:alert_condition  "goal"
                                                                   :alert_first_only false
                                                                   :alert_above_goal true}}]
        (email-test-setup
         (pulse/send-pulse! (models.pulse/retrieve-notification pulse-id))
         (is (= (rasta-alert-email "Metabase alert: Test card has reached its goal"
                                   [test-card-result png-attachment])
                (mt/summarize-multipart-email test-card-regex))))))))

(deftest basic-slack-test-2
  (testing "Basic slack test, 2 cards, 1 recipient channel"
    (mt/with-temp* [Card         [{card-id-1 :id} (checkins-query-card {:breakout [!hour.date]})]
                    Card         [{card-id-2 :id} (-> {:breakout [[:datetime-field (mt/id :checkins :date) "minute"]]}
                                                      checkins-query-card
                                                      (assoc :name "Test card 2"))]
                    Pulse        [{pulse-id :id}  {:name          "Pulse Name"
                                                   :skip_if_empty false}]
                    PulseCard    [_               {:pulse_id pulse-id
                                                   :card_id  card-id-1
                                                   :position 0}]
                    PulseCard    [_               {:pulse_id pulse-id
                                                   :card_id  card-id-2
                                                   :position 1}]
                    PulseChannel [{pc-id :id}     {:pulse_id     pulse-id
                                                   :channel_type "slack"
                                                   :details      {:channel "#general"}}]]
      (slack-test-setup
       (let [[slack-data] (pulse/send-pulse! (models.pulse/retrieve-pulse pulse-id))]
         (is (= {:channel-id "#general",
                 :message    "Pulse: Pulse Name",
                 :attachments
                 [{:title                  card-name,
                   :attachment-bytes-thunk true,
                   :title_link             (str "https://metabase.com/testmb/question/" card-id-1),
                   :attachment-name        "image.png",
                   :channel-id             "FOO",
                   :fallback               card-name}
                  {:title                  "Test card 2",
                   :attachment-bytes-thunk true
                   :title_link             (str "https://metabase.com/testmb/question/" card-id-2),
                   :attachment-name        "image.png",
                   :channel-id             "FOO",
                   :fallback               "Test card 2"}]}
                (thunk->boolean slack-data)))
         (testing "attachments"
           (is (= true
                  (every? produces-bytes? (:attachments slack-data))))))))))

(deftest multi-channel-test
  (testing "Test with a slack channel and an email"
    (mt/with-temp Card [{card-id :id} (checkins-query-card {:breakout [!hour.date]})]
      ;; create a Pulse with an email channel
      (with-pulse-for-card [{pulse-id :id} {:card card-id, :pulse {:skip_if_empty false}}]
        ;; add additional Slack channel
        (mt/with-temp PulseChannel [_ {:pulse_id     pulse-id
                                       :channel_type "slack"
                                       :details      {:channel "#general"}}]
          (slack-test-setup
           (let [pulse-data (pulse/send-pulse! (models.pulse/retrieve-pulse pulse-id))
                 slack-data (m/find-first #(contains? % :channel-id) pulse-data)
                 email-data (m/find-first #(contains? % :subject) pulse-data)]
             (is (= {:channel-id  "#general"
                     :message     "Pulse: Pulse Name"
                     :attachments [{:title                  card-name
                                    :attachment-bytes-thunk true
                                    :title_link             (str "https://metabase.com/testmb/question/" card-id)
                                    :attachment-name        "image.png"
                                    :channel-id             "FOO"
                                    :fallback               card-name}]}
                    (thunk->boolean slack-data)))
             (is (every? produces-bytes? (:attachments slack-data)))
             (is (= {:subject "Pulse: Pulse Name", :recipients ["rasta@metabase.com"], :message-type :attachments}
                    (select-keys email-data [:subject :recipients :message-type])))
             (is (= 2
                    (count (:message email-data))))
             (is (email-body? (first (:message email-data))))
             (is (attachment? (second (:message email-data)))))))))))

(deftest dont-run-async-test
  (testing "even if Card is saved as `:async?` we shouldn't run the query async"
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :query
                                              :query    {:source-table (mt/id :venues)}
                                              :async?   true}}]
      (is (schema= {:card   (s/pred map?)
                    :result (s/pred map?)}
                   (pulse/execute-card {} card))))))

(deftest pulse-permissions-test
  (testing "Pulses should be sent with the Permissions of the user that created them."
    (letfn [(send-pulse-created-by-user! [user-kw]
              (mt/with-temp* [Collection [coll]
                              Card       [card {:dataset_query (mt/mbql-query checkins
                                                                 {:order-by [[:asc $id]]
                                                                  :limit    1})
                                                :collection_id (:id coll)}]]
                (perms/revoke-collection-permissions! (group/all-users) coll)
                (pulse.tu/send-pulse-created-by-user! user-kw card)))]
      (is (= [[1 "2014-04-07T00:00:00Z" 5 12]]
             (send-pulse-created-by-user! :crowberto)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"^You do not have permissions to view Card [\d,]+."
           (mt/suppress-output
             (send-pulse-created-by-user! :rasta)))
          "If the current user doesn't have permissions to execute the Card for a Pulse, an Exception should be thrown."))))
