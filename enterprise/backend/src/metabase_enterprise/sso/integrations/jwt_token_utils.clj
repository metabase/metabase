
(ns metabase-enterprise.sso.integrations.jwt-token-utils
  "Functions for handling validation tokens when working with SDK calls"
  ())

(def tokens (atom #{}))

(defn validate-token [token]
  (let [result (atom false)]
    (swap! tokens
           (fn [s]
             (if (contains? s token)
               (do (reset! result true)
                   (disj s token))
               s)))
    @result))

(defn generate-token (let [new-uuid (str (java.util.UUID/randomUUID))] (swap! tokens conj new-uuid) new-uuid))

(def get-token-from-header
  [request]
  (get (:headers request) "x-metabase-sdk-jwt-hash" nil))