(ns metabase.test.data.api-keys
  (:require
   [metabase.test.data.users :refer [user-http-request]]
   [metabase.http-client :as client]))

(defn api-key
  "Creates a user API key in a group"
  [group-id]
  (:unmasked_key (user-http-request :crowberto :post 200 "api-key" {:group_id group-id
                                                                    :name (str (random-uuid))})))


(defn api-key-http-request
  "Given an API key, makes an request using that API key"
  [key & args]
  (let [parsed-args (client/parse-args args)
        full-args (-> parsed-args
                      (assoc-in [:request-options :request-options :headers "x-api-key"] key)
                      client/unparse-args)]
    (apply client/client full-args)))
