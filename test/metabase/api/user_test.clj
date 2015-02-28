(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [medley.core :as medley]
            [metabase.db :refer :all]
            (metabase.models [org-perm :refer [OrgPerm]])
            [metabase.test-data :refer :all]
            [metabase.util :as u]))

(def rasta-org-perm-id (delay (sel :one :id OrgPerm :organization_id @org-id :user_id (user->id :rasta))))

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(PROP-FN form-keyword)`.

    ($->prop my-fn 'fish)  -> 'fish
    ($->prop my-fn '$fish) -> '(my-fn :fish)"
  [prop-fn form]
  (if-not (symbol? form) form
          (let [[first-char & rest-chars] (name form)]
            (if-not (= first-char \$) form
                    (let [form (->> rest-chars
                                    (apply str)
                                    keyword)]
                      `(~prop-fn ~form))))))

(defmacro with-$-props
  "Replace symbols like `$symbol` with ones like `(:symbol OBJ)` in BODY.

    (with-$-props (sel :one User :id 1)
      {:name $first_name})
    ->
    ({:name (:first_name <user>)}) ; <user> being the instance that came back from `sel`"
  [obj & body]
  (let [obj## (gensym)]
    `(let [~obj## ~obj]
       ~@(map (partial clojure.walk/prewalk (partial $->prop obj##))
              body))))


(defn deserialize-dates
  "Deserialize date strings with KEYS returned in RESPONSE."
  [response & [k & ks]]
  {:pre [(map? response)
         (keyword? k)]}
  (let [response (medley/update response k #(some->> (u/parse-iso8601 %)
                                                     .getTime
                                                     java.sql.Timestamp.))]
    (if (empty? ks) response
        (apply deserialize-dates response ks))))

(expect (with-$-props (fetch-user :rasta)
          {:email "rasta@metabase.com"
           :first_name "Rasta"
           :last_name "Toucan"
           :common_name "Rasta Toucan"
           :date_joined $date_joined
           :last_login $last_login
           :is_active true
           :is_staff true
           :is_superuser false
           :id $id
           :org_perms [{:organization {:inherits true
                                       :logo_url nil
                                       :description nil
                                       :name "Test Organization"
                                       :slug "test"
                                       :id @org-id}
                        :organization_id @org-id
                        :user_id $id
                        :admin true
                        :id @rasta-org-perm-id}]})
        (-> ((user->client :rasta) :get 200 "user/current")
            (deserialize-dates :last_login :date_joined)))
