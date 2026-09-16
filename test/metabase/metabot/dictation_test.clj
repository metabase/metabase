(ns metabase.metabot.dictation-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.dictation :as dictation]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private connections
  [{:key "first" :type "openai" :config {:api-key "first-key"}}
   {:key "selected" :type "openai" :config {:api-key "selected-key" :base-url "https://example.com/"}}])

(deftest connection-selection-test
  (mt/with-dynamic-fn-redefs [llm.provider/connections (constantly connections)]
    (doseq [[model expected-key] [["selected/gpt-5.4" "selected"]
                                  ["anthropic/claude-sonnet-4-5" "first"]]]
      (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-provider (constantly model)]
        (is (= expected-key (:key (dictation/connection)))))))
  (mt/with-dynamic-fn-redefs [llm.provider/connections
                              (constantly [{:key "empty" :type "openai" :config {:api-key ""}}
                                           {:key "other" :type "anthropic" :config {:api-key "other-key"}}])]
    (is (nil? (dictation/connection)))))

(deftest transcription-test
  (let [file (File/createTempFile "metabot-dictation-test" ".webm")
        sent (atom nil)]
    (try
      (spit file "recorded audio")
      (mt/with-dynamic-fn-redefs [llm.provider/connections (constantly connections)
                                  metabot.settings/llm-metabot-provider (constantly "selected/gpt-5.4")
                                  self.core/request (fn [auth request]
                                                      (reset! sent [auth request])
                                                      {:body {:text "Show me the birds."}})]
        (is (= {:text "Show me the birds."}
               (dictation/transcribe! {:tempfile file :content-type "audio/webm;codecs=opus"})))
        (is (=? [{:url "https://example.com" :headers {"Authorization" "Bearer selected-key"}}
                 {:method :post :url "/v1/audio/transcriptions"
                  :multipart [{:name "model" :content "gpt-transcribe"}
                              {:name "file" :content file :filename "dictation.webm"}]}]
                @sent)))
      (finally (io/delete-file file :silently)))))

(deftest invalid-recording-test
  (let [file (File/createTempFile "metabot-dictation-test" ".webm")
        calls (atom 0)]
    (try
      (mt/with-dynamic-fn-redefs [self.core/request (fn [& _] (swap! calls inc))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"empty"
                              (dictation/transcribe! {:tempfile file :content-type "audio/webm"})))
        (spit file "audio")
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unsupported"
                              (dictation/transcribe! {:tempfile file :content-type "text/plain"})))
        (is (zero? @calls)))
      (finally (io/delete-file file :silently)))))

(deftest upstream-error-test
  (let [file (File/createTempFile "metabot-dictation-test" ".webm")]
    (try
      (spit file "audio")
      (mt/with-dynamic-fn-redefs [llm.provider/connections (constantly connections)
                                  self.core/request (fn [& _]
                                                      (throw (ex-info "secret upstream details" {:status 429})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Dictation is busy"
                              (dictation/transcribe! {:tempfile file :content-type "audio/webm"}))))
      (finally (io/delete-file file :silently)))))
