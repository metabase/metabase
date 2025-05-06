(ns metabase.embedding.app-origins-sdk
  (:require
   [clojure.string :as str]
   [metabase.settings.core  :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]))

(mu/defn- ignore-localhost :- :string
  "Remove localhost:* or localhost:<port> from the list of origins."
  [s :- [:maybe :string]]
  (->> (str/split (or s "") #"\s+")
       (remove #(re-matches #"localhost:(\*|\d+)" %))
       distinct
       (str/join " ")
       str/trim))

(mu/defn- add-localhost :- :string [s :- [:maybe :string]]
  (->> s ignore-localhost (str "localhost:* ") str/trim))

(defn embedding-app-origins-sdk-setter
  "The setter for [[embedding-app-origins-sdk]].

  Checks that we have SDK embedding feature and that it's enabled, then sets the value accordingly."
  [new-value]
  (add-localhost ;; return the same value that is returned from the getter
   (->> new-value
        ignore-localhost
        ;; Why ignore-localhost?, because localhost:* will always be allowed, so we don't need to store it, if we
        ;; were to store it, and the value was set N times, it would have localhost:* prefixed N times. Also, we
        ;; should not store localhost:port, since it's covered by localhost:* (which is the minumum value).
        (setting/set-value-of-type! :string :embedding-app-origins-sdk))))

(defsetting embedding-app-origins-sdk
  (deferred-tru "Allow Metabase SDK access to these space delimited origins.")
  :type       :string
  :export?    false
  :visibility :public
  :feature    :embedding-sdk
  :default    "localhost:*"
  :encryption :no
  :audit      :getter
  :getter    (fn embedding-app-origins-sdk-getter []
               (add-localhost (setting/get-value-of-type :string :embedding-app-origins-sdk)))
  :setter   embedding-app-origins-sdk-setter)
