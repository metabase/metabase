(ns metabase-enterprise.metabot-v3.tools.invite-user
  (:require
   [metabase.users.core :as users]))

(defn invite-user
  "Send a Metabase invitation to the address `email`."
  [{:keys [email]}]
  (try
    (users/invite-user! {:email email})
    {:output (format "%s has been invited to Metabase." email)}
    (catch clojure.lang.ExceptionInfo e
      (let [d (ex-data e)]
        (if-let [message (when (= (:status-code d) 400)
                           (-> d :errors :email))]
          {:output message}
          (throw e))))))
