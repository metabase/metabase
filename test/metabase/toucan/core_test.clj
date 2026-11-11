(ns metabase.toucan.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.toucan.core :as t2]
   [toucan2.core]))

(deftest ^:parallel kv-values-wrapped-test
  (is (= '(toucan2.core/select-one :model/User :id (metabase.toucan.impl/value id))
         (macroexpand-1 '(metabase.toucan.core/select-one :model/User :id id))))
  (is (= '(toucan2.core/select :model/User :id [:in (metabase.toucan.impl/value ids)] :is_active true)
         (macroexpand-1 '(metabase.toucan.core/select :model/User :id [:in ids] :is_active true)))))

(deftest ^:parallel query-map-wrapped-recursively-test
  (is (= '(toucan2.core/query {:select [:id]
                               :from   [:core_user]
                               :where  [:and [:= :email (metabase.toucan.impl/value (str a b))]
                                        (metabase.toucan.impl/value (f x))]
                               :limit  (metabase.toucan.impl/value n)})
         (macroexpand-1 '(metabase.toucan.core/query {:select [:id]
                                                       :from   [:core_user]
                                                       :where  [:and [:= :email (str a b)] (f x)]
                                                       :limit  n})))))

(deftest update-conditions-wrapped-test
  (is (= '(toucan2.core/update! :model/User :id (metabase.toucan.impl/value id)
                                {:first_name first-name})
         (macroexpand-1 '(metabase.toucan.core/update! :model/User :id id {:first_name first-name})))))

(deftest insert-rows-passed-through-test
  (is (= '(toucan2.core/insert! :model/User {:email email})
         (macroexpand-1 '(metabase.toucan.core/insert! :model/User {:email email})))))

(defn- expansion-error
  "The message of the error thrown while macroexpanding `form`, or an empty string when it expands."
  [form]
  (try
    (str (macroexpand-1 form) "")
    (catch Exception e
      (ex-message (or (ex-cause e) e)))))

(deftest ^:parallel trailing-arg-must-be-literal-map-test
  (doseq [form ['(metabase.toucan.core/select-one :model/User id)
                '(metabase.toucan.core/select-one :model/User (str "SELECT " x))
                '(metabase.toucan.core/select-one :model/User 1)
                '(metabase.toucan.core/select :model/User :is_active true ["SELECT 1"])]]
    (testing (pr-str form)
      (is (re-find #"The trailing arg must be a literal query map" (expansion-error form))))))

(deftest update-positional-pk-rejected-test
  (is (re-find #"The trailing arg must be a literal query map"
               (expansion-error '(metabase.toucan.core/update! :model/User id {:first_name "x"})))))

(deftest ^:parallel string-value-bound-test
  (let [email        "x' OR 1=1 --"
        [sql & args] (toucan2.core/compile (t2/select :model/User :email email))]
    (is (re-find #"(?i)email\W* = \?$" sql))
    (is (= ["x' OR 1=1 --"] args))))

(deftest ^:parallel fragment-spliced-test
  (letfn [(email-is [email] (t2/fragment [:= :email email]))]
    (let [[sql & args] (toucan2.core/compile (t2/select :model/User {:where (email-is "a@b.c")}))]
      (is (re-find #"(?i)email\W* = \?$" sql))
      (is (= ["a@b.c"] args)))))

(deftest ^:parallel nil-fragment-dropped-test
  (letfn [(email-is [email] (when email (t2/fragment [:= :email email])))]
    (let [[sql & args] (toucan2.core/compile (t2/select :model/User {:where [:and (email-is nil)]}))]
      (is (re-find #"(?i)WHERE true$" sql))
      (is (empty? args)))))

(deftest ^:parallel plain-honeysql-value-rejected-test
  (letfn [(email-is [email] [:= :email email])]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Marked a whole operator form"
                          (toucan2.core/compile (t2/select :model/User {:where (email-is "a@b.c")}))))))

(deftest ^:parallel operator-form-value-rejected-test
  (let [email [:or true]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Marked a whole operator form"
                          (toucan2.core/compile (t2/select :model/User :email email))))))

(deftest ^:parallel integer-limit-spliced-test
  (let [n            5
        [sql & args] (toucan2.core/compile (t2/select :model/User {:limit n}))]
    (is (re-find #"LIMIT 5$" sql))
    (is (empty? args))))
