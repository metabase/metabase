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

(deftest update-changes-wrapped-test
  (is (= '(toucan2.core/update! :model/User :id (metabase.util.toucan2/value id)
                                {:first_name (metabase.util.toucan2/value first-name)})
         (macroexpand-1 '(metabase.util.toucan2/update! :model/User :id id {:first_name first-name})))))

(deftest ^:parallel string-value-bound-test
  (let [email "x' OR 1=1 --"]
    (is (= ["SELECT * FROM \"CORE_USER\" WHERE \"EMAIL\" = ?" "x' OR 1=1 --"]
           (t2/compile (t2x/select :model/User :email email))))))

(deftest ^:parallel fragment-spliced-test
  (letfn [(email-is [email] (t2x/fragment [:= :email email]))]
    (is (= ["SELECT * FROM \"CORE_USER\" WHERE \"EMAIL\" = ?" "a@b.c"]
           (t2/compile (t2x/select :model/User {:where (email-is "a@b.c")}))))))

(deftest ^:parallel nil-fragment-dropped-test
  (letfn [(email-is [email] (when email (t2x/fragment [:= :email email])))]
    (is (= ["SELECT * FROM \"CORE_USER\" WHERE true"]
           (t2/compile (t2x/select :model/User {:where [:and (email-is nil)]}))))))

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
  (let [n 5]
    (is (= ["SELECT * FROM \"CORE_USER\" LIMIT 5"]
           (t2/compile (t2x/select :model/User {:limit n}))))))
