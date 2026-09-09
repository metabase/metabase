(ns metabase-enterprise.mcp.v2.redaction-sandbox-test
  "The v2 read paths whose redaction only has teeth where a sandbox exists: the sandboxed-caller
   branch of [[metabase.mcp.v2.redaction/redact-notification]], and the fingerprint strip in
   `get_content`'s `fields` include. In OSS `sandboxed-or-impersonated-user?` is always false and no
   table is row-restricted, so neither branch can be driven there; the rules that hold in OSS too are
   pinned in `metabase.mcp.v2.redaction-test` and `metabase.mcp.v2.tools.content-test`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.test :as met]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.metabot.metadata-perms :as metadata-perms]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; `deftool` registers on load, so the tool namespace has to be required for `call-tool` to find it.
(comment tools.content/keep-me)

(defn- user-recipient
  [user-id]
  {:type :notification-recipient/user :user_id user-id :user {:id user-id :tenant_id nil}})

(deftest sandboxed-caller-sees-only-itself-among-user-recipients-test
  (testing "a sandboxed caller sees only itself among user recipients; raw-value recipients survive"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (let [rasta-id     (mt/user->id :rasta)
            notification {:id           3
                          ;; outside the payload-strip set, so only the per-recipient filters run
                          :payload_type :notification/testing
                          :handlers     [{:id           10
                                          :channel_type :channel/email
                                          :recipients   [(user-recipient rasta-id)
                                                         (user-recipient (mt/user->id :lucky))
                                                         {:type    :notification-recipient/raw-value
                                                          :details {:value "someone@example.com"}}]}]}
            kept         (mt/with-test-user :rasta
                           (->> (redaction/redact-notification notification) :handlers first :recipients))]
        (is (= [rasta-id nil] (mapv :user_id kept))
            "the other user is hidden; the caller and the raw address remain")))))

(defn- fingerprinted-columns
  "Names of the columns in a `fields` include payload that still carry a `:fingerprint`."
  [row]
  (into #{} (comp (filter :fingerprint) (map :name)) (:result_metadata row)))

(defn- get-content-fields
  "`get_content` on `card-id` with the `fields` include, as the current test user."
  [card-id]
  (let [{:keys [result error]} (registry/call-tool nil "test-session" "get_content"
                                                   {:items [{:type "question" :id card-id}]
                                                    :include ["fields"]})]
    (when error
      (throw (ex-info (str "get_content rejected: " (:message error)) {:error error})))
    (first (:results (json/decode+kw (-> result :content first :text))))))

(deftest sandboxed-caller-does-not-receive-fingerprints-test
  (testing "a fingerprint is computed over every row of its table — `:min`/`:max` are individual cell
            values and `:distinct-count` counts them all — so a caller whose rows are narrowed by a
            sandbox must not receive one. Without the strip, a sandbox showing 10 of 100 rows still
            reports statistics over all 100."
    (met/with-gtaps-for-user! :rasta
      {:gtaps      {:venues {:remappings {:cat [:dimension [:field (mt/id :venues :category_id) nil]]}}}
       :attributes {"cat" "50"}}
      ;; The card is created inside the fixture so its stored `result_metadata` carries the
      ;; sandboxed database's table ids — the ones `row-restricted-table-ids` answers about.
      (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                                :creator_id    (mt/user->id :crowberto)
                                                :dataset_query (mt/mbql-query venues)}]
        (testing "unsandboxed, the fingerprints are present — otherwise this test could pass vacuously"
          (mt/with-test-user :crowberto
            (is (seq (fingerprinted-columns (get-content-fields card-id)))
                "an admin with no row restriction still sees fingerprints")))
        (mt/with-test-user :rasta
          (testing "precondition: the sandbox really does narrow rasta's rows on VENUES"
            (is (contains? (metadata-perms/row-restricted-table-ids #{(mt/id :venues)})
                           (mt/id :venues))
                "if this fails the strip has nothing to key off and the rest is vacuous"))
          (let [row (get-content-fields card-id)]
            (is (nil? (:error row)) "the read still succeeds — this redacts, it does not refuse")
            (is (seq (:result_metadata row)) "column metadata is still returned")
            (is (= #{} (fingerprinted-columns row))
                (str "no column may carry a :fingerprint for a sandboxed caller; got "
                     (pr-str (fingerprinted-columns row))))))))))
