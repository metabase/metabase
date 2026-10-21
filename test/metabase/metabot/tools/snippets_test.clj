(ns metabase.metabot.tools.snippets-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.snippets :as tools.snippets]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- unavailable-snippet
  [snippet-id tool-names]
  (test-util/tool-failure tools.snippets/get-snippet-details-tool {:snippet_id snippet-id} tool-names))

(defn- not-found-message
  [snippet-id]
  (str "Snippet " snippet-id " was not found. It may not exist, or you may not have access to it."))

(deftest missing-snippet-test
  (mt/with-current-user (mt/user->id :crowberto)
    (is (= {:class :recoverable
            :code  :metabase.metabot.tools.recoverable.common/not-found
            :text  (not-found-message Integer/MAX_VALUE)}
           (unavailable-snippet Integer/MAX_VALUE #{})))))

(deftest unreadable-snippet-test
  (mt/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name    "Private snippet"
                                                           :content "SELECT 'private'"}]
    (mt/with-test-user :rasta
      (mt/with-dynamic-fn-redefs [snippets/has-any-native-permissions? (constantly false)]
        (is (= {:class :recoverable
                :code  :metabase.metabot.tools.recoverable.common/not-found
                :text  (not-found-message snippet-id)}
               (unavailable-snippet snippet-id #{})))
        (is (= {:output "No snippets available."}
               (test-util/call-tool tools.snippets/list-snippets-tool {})))))))

(deftest ^:parallel snippet-recovery-test
  (doseq [status [403 404]
          tool-names [#{} #{"search"} #{"list_snippets"} #{"list_snippets" "search"}]]
    (testing (str "status " status ", tools " tool-names)
      (mt/with-dynamic-fn-redefs [snippets/get-native-query-snippet
                                (fn [_] (throw (ex-info "private details" {:status-code status})))]
        (let [error (unavailable-snippet 7 tool-names)]
          (is (= :recoverable (:class error)))
          (is (= :metabase.metabot.tools.recoverable.common/not-found (:code error)))
          (is (= (str (not-found-message 7)
                      (when (contains? tool-names "list_snippets")
                        (str "\n"
                             "Call `list_snippets` to find an available snippet and use an id from the results.")))
                 (:text error))))))))

(deftest ^:parallel nil-snippet-test
  (mt/with-dynamic-fn-redefs [snippets/get-native-query-snippet (constantly nil)]
    (is (= {:class :recoverable
            :code  :metabase.metabot.tools.recoverable.common/not-found
            :text  (not-found-message 7)}
           (unavailable-snippet 7 #{})))))

(deftest ^:parallel list-snippets-output-test
  (doseq [[items expected]
          [[[] "No snippets available."]
           [[{:id 7 :name "Birds & \"nests\"" :description "a < b"}
             {:id 8 :name "Owls" :description nil}]
            (str "<snippets>\n"
                 "<snippet id=\"7\" name=\"Birds & \"nests\"\">a < b</snippet>\n"
                 "<snippet id=\"8\" name=\"Owls\"></snippet>\n"
                 "</snippets>")]]]
    (mt/with-dynamic-fn-redefs [snippets/list-native-query-snippets (constantly items)]
      (is (= {:output expected}
             (test-util/call-tool tools.snippets/list-snippets-tool {}))))))

(deftest ^:parallel snippet-details-output-test
  (doseq [[fields expected]
          [[{:description "a < b & c" :content "SELECT '<owl>'\nWHERE 1 < 2"}
            (str "<description>a < b & c</description>\n"
                 "<content>\nSELECT '<owl>'\nWHERE 1 < 2\n</content>\n")]
           [{:description nil :content nil} ""]
           [{:description "" :content ""} "<description></description>\n<content>\n\n</content>\n"]]]
    (mt/with-dynamic-fn-redefs [snippets/get-native-query-snippet
                              (fn [id] (assoc fields :id id :name "Birds & \"nests\""))]
      (is (= {:output (str "<snippet id=\"7\" name=\"Birds & \"nests\"\">\n" expected "</snippet>")}
             (test-util/call-tool tools.snippets/get-snippet-details-tool {:snippet_id 7}))))))

(deftest ^:parallel unexpected-snippet-errors-test
  (doseq [e [(ex-info "database failure" {:status-code 500})
             (ex-info "unexpected input error" {:status-code 400 :agent-error? true})
             (RuntimeException. "unexpected failure")]]
    (mt/with-dynamic-fn-redefs [snippets/list-native-query-snippets (fn [] (throw e))
                              snippets/get-native-query-snippet (fn [_] (throw e))]
      (doseq [[tool args] [[tools.snippets/list-snippets-tool {}]
                          [tools.snippets/get-snippet-details-tool {:snippet_id 7}]]]
        (let [caught (is (thrown? Throwable (test-util/call-tool tool args)))]
          (is (identical? e caught))
          (is (= {:class :unrecoverable :code :internal} (tools.error/classify caught))))))))
