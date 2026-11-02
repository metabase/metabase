(ns metabase.util.toucan2-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.toucan2 :as t2x]
   [toucan2.core :as t2]))

(deftest ^:parallel kv-values-wrapped-test
  (is (= '(toucan2.core/select-one :model/User :id (metabase.util.toucan2/value id))
         (macroexpand-1 '(metabase.util.toucan2/select-one :model/User :id id))))
  (is (= '(toucan2.core/select :model/User :id [:in (metabase.util.toucan2/value ids)] :is_active true)
         (macroexpand-1 '(metabase.util.toucan2/select :model/User :id [:in ids] :is_active true)))))

(deftest ^:parallel query-map-wrapped-recursively-test
  (is (= '(toucan2.core/query {:select [:id]
                               :from   [:core_user]
                               :where  [:and [:= :email (metabase.util.toucan2/value (str a b))]
                                        (metabase.util.toucan2/value (f x))]
                               :limit  (metabase.util.toucan2/value n)})
         (macroexpand-1 '(metabase.util.toucan2/query {:select [:id]
                                                       :from   [:core_user]
                                                       :where  [:and [:= :email (str a b)] (f x)]
                                                       :limit  n})))))

(deftest update-conditions-wrapped-test
  (is (= '(toucan2.core/update! :model/User :id (metabase.util.toucan2/value id)
                                {:first_name first-name})
         (macroexpand-1 '(metabase.util.toucan2/update! :model/User :id id {:first_name first-name})))))

(deftest insert-rows-passed-through-test
  (is (= '(toucan2.core/insert! :model/User {:email email})
         (macroexpand-1 '(metabase.util.toucan2/insert! :model/User {:email email})))))

(defn- expansion-error
  "The message of the error thrown while macroexpanding `form`, or an empty string when it expands."
  [form]
  (try
    (str (macroexpand-1 form) "")
    (catch Exception e
      (ex-message (or (ex-cause e) e)))))

(deftest ^:parallel trailing-arg-must-be-literal-map-test
  (doseq [form ['(metabase.util.toucan2/select-one :model/User id)
                '(metabase.util.toucan2/select-one :model/User (str "SELECT " x))
                '(metabase.util.toucan2/select-one :model/User 1)
                '(metabase.util.toucan2/select :model/User :is_active true ["SELECT 1"])]]
    (testing (pr-str form)
      (is (re-find #"The trailing arg must be a literal query map" (expansion-error form))))))

(deftest update-positional-pk-rejected-test
  (is (re-find #"The trailing arg must be a literal query map"
               (expansion-error '(metabase.util.toucan2/update! :model/User id {:first_name "x"})))))

(deftest ^:parallel string-value-bound-test
  (let [email        "x' OR 1=1 --"
        [sql & args] (t2/compile (t2x/select :model/User :email email))]
    (is (re-find #"(?i)email\W* = \?$" sql))
    (is (= ["x' OR 1=1 --"] args))))

(deftest ^:parallel fragment-spliced-test
  (letfn [(email-is [email] (t2x/fragment [:= :email email]))]
    (let [[sql & args] (t2/compile (t2x/select :model/User {:where (email-is "a@b.c")}))]
      (is (re-find #"(?i)email\W* = \?$" sql))
      (is (= ["a@b.c"] args)))))

(deftest ^:parallel nil-fragment-dropped-test
  (letfn [(email-is [email] (when email (t2x/fragment [:= :email email])))]
    (let [[sql & args] (t2/compile (t2x/select :model/User {:where [:and (email-is nil)]}))]
      (is (re-find #"(?i)WHERE true$" sql))
      (is (empty? args)))))

(deftest ^:parallel plain-honeysql-value-rejected-test
  (letfn [(email-is [email] [:= :email email])]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Marked a whole operator form"
                          (t2/compile (t2x/select :model/User {:where (email-is "a@b.c")}))))))

(deftest ^:parallel operator-form-value-rejected-test
  (let [email [:or true]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Marked a whole operator form"
                          (t2/compile (t2x/select :model/User :email email))))))

(deftest ^:parallel integer-limit-spliced-test
  (let [n            5
        [sql & args] (t2/compile (t2x/select :model/User {:limit n}))]
    (is (re-find #"LIMIT 5$" sql))
    (is (empty? args))))
