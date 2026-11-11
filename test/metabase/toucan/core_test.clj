(ns metabase.toucan.core-test
  (:require
   [clojure.edn :as edn]
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

(deftest ^:parallel fragment-is-plain-honeysql-test
  (let [email "a@b.c"]
    (is (= [:= :email [:auto/param "a@b.c"]] (t2/fragment [:= :email email])))
    (is (= {:where [:= :email [:auto/param "a@b.c"]]} (t2/fragment {:where [:= :email email]})))))

(deftest ^:parallel nil-fragment-dropped-test
  (letfn [(email-is [email] (when email (t2/fragment [:= :email email])))]
    (let [[sql & args] (toucan2.core/compile (t2/select :model/User {:where [:and (email-is nil)]}))]
      (is (re-find #"(?i)WHERE true$" sql))
      (is (empty? args)))))

(deftest ^:parallel fragment-subquery-allowed-test
  (letfn [(user-ids [email] (t2/fragment {:select [:id] :from [:core_user] :where [:= :email email]}))]
    (let [[sql & args] (toucan2.core/compile (t2/select :model/User {:where [:in :id (user-ids "a@b.c")]}))]
      (is (re-find #"(?i)email\W* = \?\)$" sql))
      (is (= ["a@b.c"] args)))))

(deftest ^:parallel parsed-data-not-fragment-test
  (is (t2/fragment? (t2/fragment [:= :email "a@b.c"])))
  (is (not (t2/fragment? (with-meta [:= :email "a@b.c"] {:allow-subquery true}))))
  (is (not (t2/fragment? (edn/read-string "^{:fragment true} [:= :email \"a@b.c\"]")))))

(deftest ^:parallel table-name-left-unbound-test
  (is (= '(toucan2.core/query {:select [:id] :from [(metabase.toucan.core/table-name :model/User)]})
         (macroexpand-1 '(metabase.toucan.core/query {:select [:id] :from [(metabase.toucan.core/table-name :model/User)]}))))
  (let [[sql & args] (toucan2.core/compile (t2/select :model/User {:from [(t2/table-name :model/User)]}))]
    (is (re-find #"(?i)FROM \W?core_user\W?$" sql))
    (is (empty? args))))

(deftest ^:parallel table-name-requires-literal-model-test
  (is (re-find #"The model must be a literal keyword"
               (expansion-error '(metabase.toucan.core/table-name model)))))

(deftest ^:parallel changed-fragment-not-fragment-test
  (let [email    "a@b.c"
        fragment (t2/fragment {:select [:id] :from [:core_user] :where [:= :email email]})]
    (is (t2/fragment? fragment))
    (is (not (t2/fragment? (assoc fragment :where [:= :email "x"]))))
    (is (not (t2/fragment? (update fragment :select conj :password))))
    (is (not (t2/fragment? (with-meta {:select [:password] :from [:core_user]} (meta fragment)))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"would reach SQL unlifted"
                          (toucan2.core/compile
                            (t2/select :model/User {:where [:in :id (assoc fragment :select [:password])]}))))))

(deftest ^:parallel operator-kv-arg-transformed-test
  (let [types        [:personal :internal]
        [sql & args] (toucan2.core/compile (t2/select :model/User :type [:in types]))]
    (is (re-find #"(?i)type\W* IN \(\?, \?\)$" sql))
    (is (= ["personal" "internal"] args)))
  (let [lo           :internal
        hi           :personal
        [sql & args] (toucan2.core/compile (t2/select :model/User :type [:between lo hi]))]
    (is (re-find #"(?i)type\W* BETWEEN \? AND \?$" sql))
    (is (= ["internal" "personal"] args))))

(deftest ^:parallel column-name-expands-to-literal-test
  (is (= :email (macroexpand-1 '(metabase.toucan.core/column-name :email))))
  (is (= :u.email (macroexpand-1 '(metabase.toucan.core/column-name :u :email))))
  (is (= '(toucan2.core/select :model/User {:where [:= (metabase.toucan.core/column-name :u :email)
                                                     (metabase.toucan.impl/value email)]})
         (macroexpand-1 '(metabase.toucan.core/select :model/User {:where [:= (metabase.toucan.core/column-name :u :email)
                                                                          email]}))))
  (let [email        "a@b.c"
        [sql & args] (toucan2.core/compile (t2/select :model/User {:where [:= (t2/column-name :email) email]}))]
    (is (re-find #"(?i)email\W* = \?$" sql))
    (is (= ["a@b.c"] args))))

(deftest ^:parallel column-name-requires-literal-parts-test
  (doseq [form ['(metabase.toucan.core/column-name column)
                '(metabase.toucan.core/column-name alias :email)
                '(metabase.toucan.core/column-name :u.email)
                '(metabase.toucan.core/column-name :u/email)
                '(metabase.toucan.core/column-name "email")]]
    (testing (pr-str form)
      (is (re-find #"Expected a literal keyword naming one identifier" (expansion-error form))))))

(deftest ^:parallel define-macros-target-toucan-multimethods-test
  (is (= '(methodical.core/defmethod toucan2.core/table-name :model/User [_model] :core_user)
         (macroexpand-1 '(metabase.toucan.core/define-table-name :model/User [_model] :core_user))))
  (is (= '(methodical.core/defmethod toucan2.core/batched-hydrate :around [:model/User :k] [_model _k users] users)
         (macroexpand-1 '(metabase.toucan.core/define-batched-hydrate :around [:model/User :k] [_model _k users] users)))))

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

(deftest ^:parallel limit-offset-bound-test
  (let [n            5
        m            2
        [sql & args] (toucan2.core/compile (t2/select :model/User {:limit n :offset m}))]
    (is (re-find #"LIMIT \? OFFSET \?$" sql))
    (is (= [5 2] args))))

(deftest ^:parallel non-integer-limit-rejected-test
  (doseq [n ["5" -1 1.5]]
    (testing (pr-str n)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid limit"
                            (toucan2.core/compile (t2/select :model/User {:limit n}))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid offset"
                            (toucan2.core/compile (t2/select :model/User {:offset n})))))))
