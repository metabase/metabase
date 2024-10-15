(ns metabase.metabot-v3.tools.invite-user
  (:require
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.log :as log]))

(metabot-v3.tools.interface/deftool :metabot-v3.tool/invite-user
  "Invite a user to Metabase. Requires a valid email address."
  {:properties            {:email {:type :string, :description "A valid email address of the user to invite"}}
   :required              #{:email}
   :additional-properties false}
  [{:keys [email]}]
  (log/infof "✉ TODO: SEND AN EMAIL TO %s ✉" email))
