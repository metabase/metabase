(ns metabase.actions-rest.template-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.actions.core :as actions]
   [metabase.test :as mt]))

(def ^:private variable-regex #"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")

(defn- template-variable-names
  "The names of the `{{variables}}` in the request of the action `template`."
  [template]
  (->> (tree-seq coll? seq (select-keys template [:url :query_params :headers :body]))
       (filter string?)
       (mapcat #(re-seq variable-regex %))
       (map second)
       distinct))

(defn- action-templates []
  (mapcat :actions (actions/action-template-categories)))

(deftest list-templates-test
  (testing "templates are listed by service"
    (is (=? [{:id      "github"
              :name    "GitHub"
              :secrets [{:secret_name "github_token" :allowed_hosts ["api.github.com"]}]
              :actions #(some (comp #{"github-create-issue"} :id) %)}
             {:id      "linear"
              :name    "Linear"
              :secrets [{:secret_name "linear_api_key" :allowed_hosts ["api.linear.app"]}]
              :actions #(some (comp #{"linear-create-issue"} :id) %)}]
            (mt/user-http-request :crowberto :get 200 "action-template"))))
  (testing "only superusers list templates"
    (mt/user-http-request :rasta :get 403 "action-template")))

(deftest action-templates-are-valid-http-actions-test
  (testing "each action template is a valid HTTP action once its variables are parameters"
    (doseq [template (action-templates)]
      (testing (:id template)
        (is (nil? (actions/check-http-action
                   (-> (select-keys template [:name :method :url :query_params :headers :body])
                       (assoc :type       :http
                              :parameters (for [variable-name (template-variable-names template)
                                                :when         (not (str/includes? variable-name "."))]
                                            {:id variable-name, :slug variable-name, :type :string/=})))))))))
  (testing "template ids are unique"
    (let [ids (concat (map :id (action-templates))
                      (map :id (mapcat :secrets (actions/action-template-categories))))]
      (is (= (count ids) (count (distinct ids)))))))

(deftest action-templates-require-their-secrets-test
  (testing "the required secrets of an action template are secret templates of its service, named as the secrets it uses"
    (doseq [{:keys [secrets actions]} (actions/action-template-categories)
            template                  actions]
      (testing (:id template)
        (let [secret-name-by-id (into {} (map (juxt :id :secret_name)) secrets)]
          (is (every? secret-name-by-id (:required_secrets template)))
          (is (= (set (keep #(second (re-matches #"secrets\.(.+)" %)) (template-variable-names template)))
                 (set (map secret-name-by-id (:required_secrets template))))))))))
