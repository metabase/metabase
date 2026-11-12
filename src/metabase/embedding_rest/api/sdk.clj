(ns metabase.embedding-rest.api.sdk
  "`/api/embedding-sdk` endpoints, for admins."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.embedding-rest.db :as embedding-rest.db]
   [metabase.embedding.schema :as embedding.schema]
   [metabase.embedding.sdk-react-18 :as embedding.sdk-react-18]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

(def ^:private max-hosts 50)

(api.macros/defendpoint :get "/react-18-hosts" :- [:sequential ::embedding.schema/sdk-react-18-host.response]
  "The host apps that used the React embedding SDK with React 18 in the last 4 days, newest first, at most 50. `host`
  is null when the host app page URL has no hostname."
  []
  (->> (embedding-rest.db/sdk-react-18-hosts-last-seen-after (embedding.sdk-react-18/last-seen-cutoff) max-hosts)
       (filter mi/can-read?)
       (map #(update % :host not-empty))))
