(ns metabase.metabot.api.dictation-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.dictation :as dictation]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private multipart-options
  {:request-options {:headers {"content-type" "multipart/form-data"}}})

(deftest availability-test
  (mt/with-dynamic-fn-redefs [llm.settings/ai-features-enabled? (constantly true)
                              metabot.settings/metabot-enabled? (constantly true)
                              scope/resolve-user-permissions (constantly scope/all-yes-permissions)]
    (doseq [conn [nil {:key "openai"}]]
      (mt/with-dynamic-fn-redefs [dictation/connection (constantly conn)]
        (is (= {:enabled (boolean conn)}
               (mt/user-http-request :rasta :get 200 "metabot/dictation")))))))

(deftest access-test
  (mt/with-dynamic-fn-redefs [llm.settings/ai-features-enabled? (constantly true)
                              metabot.settings/metabot-enabled? (constantly true)
                              scope/resolve-user-permissions (constantly {:permission/metabot :no})]
    (mt/user-http-request :rasta :get 403 "metabot/dictation")
    (mt/user-http-request :rasta :post 403 "metabot/dictation" multipart-options
                          {:file (byte-array [1])}))
  (mt/with-dynamic-fn-redefs [llm.settings/ai-features-enabled? (constantly false)]
    (mt/user-http-request :crowberto :get 403 "metabot/dictation"))
  (mt/client :get 401 "metabot/dictation"))

(deftest transcription-cleanup-test
  (mt/with-dynamic-fn-redefs [llm.settings/ai-features-enabled? (constantly true)
                              metabot.settings/metabot-enabled? (constantly true)]
    (doseq [success? [true false]]
      (let [uploaded (atom nil)]
        (mt/with-dynamic-fn-redefs [dictation/transcribe! (fn [{:keys [tempfile]}]
                                                            (reset! uploaded tempfile)
                                                            (is (.exists ^File tempfile))
                                                            (if success?
                                                              {:text "Find birds"}
                                                              (throw (ex-info "Try again" {:status-code 502}))))]
          (let [response (mt/user-http-request :crowberto :post (if success? 200 502)
                                               "metabot/dictation" multipart-options
                                               {:file (byte-array [1 2 3])})]
            (when success?
              (is (= {:text "Find birds"} response))))
          (is (some? @uploaded))
          (is (not (.exists ^File @uploaded))))))))

(deftest oversized-upload-test
  (let [calls (atom 0)]
    (mt/with-dynamic-fn-redefs [dictation/transcribe! (fn [_] (swap! calls inc) {:text "unexpected"})]
      (mt/user-http-request :crowberto :post 413 "metabot/dictation" multipart-options
                            {:file (byte-array (inc dictation/max-recording-bytes))})
      (is (zero? @calls)))))
