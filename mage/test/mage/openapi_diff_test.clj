(ns mage.openapi-diff-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.openapi-diff :as openapi-diff]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(defn- spec
  ([paths] (spec paths {}))
  ([paths components] {"paths" paths "components" components}))

(defn- op
  "An operation with an optional JSON request body, response schema, and parameters."
  [& {:keys [body params response description]}]
  (cond-> {"description" (or description "") "parameters" (or params [])}
    body (assoc "requestBody" {"content" {"application/json" {"schema" body}}})
    response (assoc "responses" {"2XX" {"description" "ok"
                                        "content" {"application/json" {"schema" response}}}})))

(defn- obj
  ([props] {"type" "object" "properties" props})
  ([props required] (assoc (obj props) "required" required)))

(defn- qparam [required?]
  [{"in" "query" "name" "q" "required" required? "schema" {"type" "string"}}])

(defn- breaking-count [old-spec new-spec]
  (get-in (openapi-diff/diff old-spec new-spec) [:counts :breaking]))

(defn- breaking? [old-spec new-spec]
  (pos? (breaking-count old-spec new-spec)))

(defn- body-change-breaking?
  "Whether changing an endpoint's request body from `old-body` to `new-body` is classified breaking."
  [old-body new-body]
  (breaking? (spec {"/api/x" {"post" (op :body old-body)}})
             (spec {"/api/x" {"post" (op :body new-body)}})))

(defn- findings-text [old-spec new-spec]
  (->> (:changed (openapi-diff/diff old-spec new-spec))
       (mapcat :findings)
       (map second)))

(deftest endpoint-lifecycle-test
  (testing "a removed endpoint is always breaking"
    (let [d (openapi-diff/diff (spec {"/api/x" {"post" (op)}}) (spec {}))]
      (is (= ["POST /api/x"] (:removed d)))
      (is (= 1 (get-in d [:counts :breaking])))))
  (testing "a new endpoint is additive"
    (let [d (openapi-diff/diff (spec {}) (spec {"/api/x" {"get" (op)}}))]
      (is (= ["GET /api/x"] (:added d)))
      (is (zero? (get-in d [:counts :breaking])))))
  (testing "identical specs produce no findings"
    (let [s (spec {"/api/x" {"post" (op :body (obj {"a" {"type" "string"}}))}})
          d (openapi-diff/diff s s)]
      (is (empty? (:changed d)))
      (is (zero? (get-in d [:counts :breaking])))))
  (testing "identical specs WITH response schemas produce no findings"
    ;; Regression: unchanged responses were compared anyway, emitting `~ response 2XX: null -> null`
    ;; for every endpoint that declared one.
    (let [s (spec {"/api/x" {"delete" (op :response {"type" "null"})
                             "post" (op :body (obj {"a" {"type" "string"}})
                                        :response (obj {"id" {"type" "integer"}}))}})]
      (is (empty? (:changed (openapi-diff/diff s s)))))))

(deftest request-requires-more-is-breaking-test
  (testing "breaking = requires MORE from the caller"
    (doseq [[label old-body new-body]
            [["new required field"
       (obj {"a" {"type" "string"}})
       (obj {"a" {"type" "string"} "req" {"type" "string"}} ["req"])]
      ["existing field becomes required"
       (obj {"a" {"type" "string"}})
       (obj {"a" {"type" "string"}} ["a"])]
      ["type narrowed"
       (obj {"f" {"oneOf" [{"type" "boolean"} {"type" "object"}]}})
       (obj {"f" {"type" "boolean"}})]
      ["enum narrowed"
       (obj {"f" {"enum" ["a" "b" "c"]}})
       (obj {"f" {"enum" ["a" "b"]}})]
      ["schema closed to undeclared keys"
       (obj {"a" {"type" "string"}})
       (assoc (obj {"a" {"type" "string"}}) "additionalProperties" false)]
      ["field removed"
       (obj {"a" {"type" "string"} "gone" {"type" "string"}})
       (obj {"a" {"type" "string"}})]]]
      (is (body-change-breaking? old-body new-body) label))))

(deftest request-requires-less-is-additive-test
  (testing "not breaking = requires the same or LESS from the caller"
    (doseq [[label old-body new-body]
            [["new optional field"
       (obj {"a" {"type" "string"}})
       (obj {"a" {"type" "string"} "opt" {"type" "string"}})]
      ["type widened"
       (obj {"f" {"type" "boolean"}})
       (obj {"f" {"oneOf" [{"type" "boolean"} {"type" "object"}]}})]
      ["enum widened"
       (obj {"f" {"enum" ["a" "b"]}})
       (obj {"f" {"enum" ["a" "b" "c"]}})]
      ["field made nullable"
       (obj {"a" {"type" "string"}})
       (obj {"a" {"oneOf" [{"type" "string"} {"type" "null"}]}})]
      ["schema opened to undeclared keys"
       (assoc (obj {"a" {"type" "string"}}) "additionalProperties" false)
       (obj {"a" {"type" "string"}})]
      ["field no longer required"
       (obj {"a" {"type" "string"}} ["a"])
       (obj {"a" {"type" "string"}})]]]
      (is (not (body-change-breaking? old-body new-body)) label))))

(deftest param-requiredness-is-directional-test
  (testing "a param becoming required demands more: breaking"
    (is (breaking? (spec {"/api/x" {"get" (op :params (qparam false))}})
                   (spec {"/api/x" {"get" (op :params (qparam true))}}))))
  (testing "a param becoming optional demands less: additive"
    (is (not (breaking? (spec {"/api/x" {"get" (op :params (qparam true))}})
                        (spec {"/api/x" {"get" (op :params (qparam false))}})))))
  (testing "a new optional param is additive, a new required one is breaking"
    (let [none (op :params [])
          optional (op :params [{"in" "query" "name" "new" "required" false "schema" {"type" "string"}}])
          required (op :params [{"in" "query" "name" "new" "required" true "schema" {"type" "string"}}])]
      (is (not (breaking? (spec {"/api/x" {"get" none}}) (spec {"/api/x" {"get" optional}}))))
      (is (breaking? (spec {"/api/x" {"get" none}}) (spec {"/api/x" {"get" required}})))))
  (testing "a removed param is breaking"
    (is (breaking? (spec {"/api/x" {"get" (op :params (qparam false))}})
                   (spec {"/api/x" {"get" (op :params [])}})))))

(deftest response-provides-less-is-breaking-test
  (testing "the rule inverts for output: providing LESS breaks the caller"
    (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"} "gone" {"type" "string"}}))}})
                   (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}}))
        "a removed response field provides less")
    (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}})
                   (spec {"/api/x" {"get" (op :response (obj {"a" {"oneOf" [{"type" "string"} {"type" "null"}]}}))}}))
        "a response field that may now be null provides less than a guaranteed string"))
  (testing "providing MORE is additive: clients ignore unknown fields"
    (is (not (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}})
                        (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"} "extra" {"type" "string"}}))}})))
        "returning extra data is not a breaking change")
    (is (not (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"oneOf" [{"type" "string"} {"type" "null"}]}}))}})
                        (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}})))
        "a field that is never null now is a stronger guarantee")))

(deftest nested-and-ref-test
  (testing "nested body properties are compared recursively"
    (let [nested (fn [reporter] (obj {"d" (obj {"reporter" reporter})}))
          text (findings-text
                (spec {"/api/x" {"post" (op :body (nested {"oneOf" [{"type" "object"} {"type" "boolean"}]}))}})
                (spec {"/api/x" {"post" (op :body (nested {"type" "boolean"}))}}))]
      (is (some #(re-find #"body\.d\.reporter" %) text))))
  (testing "$refs are resolved, so a component-schema change surfaces as an endpoint change"
    (let [ref {"$ref" "#/components/schemas/S"}
          old-spec (spec {"/api/x" {"post" (op :body (obj {"a" ref}))}} {"schemas" {"S" {"type" "string"}}})
          new-spec (spec {"/api/x" {"post" (op :body (obj {"a" ref}))}} {"schemas" {"S" {"type" "integer"}}})]
      (is (seq (:changed (openapi-diff/diff old-spec new-spec))))
      (is (breaking? old-spec new-spec) "string -> integer narrows what the caller may send")))
  (testing "a self-referential $ref terminates instead of blowing the stack"
    (let [s (spec {"/api/x" {"post" (op :body {"$ref" "#/components/schemas/R"})}}
                  {"schemas" {"R" {"type" "object" "properties" {"self" {"$ref" "#/components/schemas/R"}}}}})]
      (is (map? (openapi-diff/diff s s))))))

(deftest signal-to-noise-test
  (testing "additive bulk does not drown the breaking few"
    ;; Mirrors the shape of a real API diff, where the long tail of change is additive.
    (let [paths (into {} (for [i (range 20)]
                           [(str "/api/n" i) {"post" (op :body (obj {"a" {"type" "string"}}))}]))
          new-paths (into {} (for [i (range 20)]
                               [(str "/api/n" i)
                                {"post" (op :body (obj {"a" {"type" "string"} "added" {"type" "string"}}))}]))
          old-spec (spec (merge paths {"/api/gone" {"post" (op)}
                                       "/api/narrow" {"post" (op :body (obj {"f" {"oneOf" [{"type" "object"} {"type" "boolean"}]}}))}}))
          new-spec (spec (merge new-paths {"/api/narrow" {"post" (op :body (obj {"f" {"type" "boolean"}}))}}))
          d (openapi-diff/diff old-spec new-spec)]
      (is (= 2 (get-in d [:counts :breaking])) "1 removed endpoint + 1 narrowing, not 22")
      (is (= 20 (count (filter #(= :additive (:severity %)) (:changed d)))))))
  (testing "breaking findings sort above additive ones"
    (let [d (openapi-diff/diff
             (spec {"/api/aaa" {"post" (op :body (obj {"a" {"type" "string"}}))}
                    "/api/zzz" {"post" (op :body (obj {"b" {"type" "string"}}))}})
             (spec {"/api/aaa" {"post" (op :body (obj {"a" {"type" "string"} "new" {"type" "string"}}))}
                    "/api/zzz" {"post" (op :body (obj {}))}}))]
      (is (= "POST /api/zzz" (:operation (first (:changed d))))))))

(deftest grouping-collapses-systematic-changes-test
  ;; One upstream PR can close every endpoint's schema at once. That is one changelog entry, so the
  ;; grouped view must report it once with its blast radius, not once per endpoint.
  (let [closed (assoc (obj {"a" {"type" "string"}}) "additionalProperties" false)
        old-spec (spec (into {} (for [i (range 8)]
                                  [(str "/api/n" i) {"post" (op :body (obj {"a" {"type" "string"}}))}])))
        new-spec (spec (into {} (for [i (range 8)]
                                  [(str "/api/n" i) {"post" (op :body closed)}])))
        d (openapi-diff/diff old-spec new-spec)
        groups (#'openapi-diff/grouped-findings (:changed d))]
    (testing "8 endpoints with the same change collapse to one group"
      (is (= 8 (count (:changed d))) "ungrouped still reports per-endpoint")
      (is (= 1 (count groups)))
      (is (= 8 (count (:operations (first groups))))))
    (testing "the group keeps its severity and lists its endpoints"
      (is (= :breaking (:severity (first groups))))
      (is (= "POST /api/n0" (first (:operations (first groups))))
          "operations are sorted so output is stable"))))

(deftest grouping-orders-by-blast-radius-test
  (testing "the widest-reaching change sorts first, and distinct changes stay distinct"
    (let [old-spec (spec (merge (into {} (for [i (range 5)]
                                           [(str "/api/wide" i) {"post" (op :body (obj {"a" {"type" "string"}}))}]))
                                {"/api/narrow" {"post" (op :body (obj {"b" {"type" "string"}}))}}))
          new-spec (spec (merge (into {} (for [i (range 5)]
                                           [(str "/api/wide" i)
                                            {"post" (op :body (assoc (obj {"a" {"type" "string"}})
                                                                     "additionalProperties" false))}]))
                                {"/api/narrow" {"post" (op :body (obj {}))}}))
          groups (#'openapi-diff/grouped-findings (:changed (openapi-diff/diff old-spec new-spec)))]
      (is (= 2 (count groups)) "two distinct changes")
      (is (= 5 (count (:operations (first groups)))) "the 5-endpoint change leads")
      (is (= 1 (count (:operations (second groups))))))))

(deftest breaking-markers-survive-rendering-test
  ;; Guards the failure mode in mozilla-ai/otari#1315, where a generator dropped breaking-change
  ;; markers at render time and a breaking commit read like any other entry.
  (testing "every breaking request change is classified breaking, never additive"
    (doseq [[label old-body new-body]
            [["removed field" (obj {"a" {"type" "string"}}) (obj {})]
             ["now required" (obj {"a" {"type" "string"}}) (obj {"a" {"type" "string"}} ["a"])]
             ["narrowed type"
              (obj {"a" {"oneOf" [{"type" "object"} {"type" "boolean"}]}})
              (obj {"a" {"type" "boolean"}})]
             ["closed schema"
              (obj {"a" {"type" "string"}})
              (assoc (obj {"a" {"type" "string"}}) "additionalProperties" false)]]]
      (let [d (openapi-diff/diff (spec {"/api/x" {"post" (op :body old-body)}})
                                 (spec {"/api/x" {"post" (op :body new-body)}}))]
        (is (pos? (get-in d [:counts :breaking])) (str label " must be breaking"))
        (is (empty? (filter #(= :additive (:severity %)) (:changed d)))
            (str label " must not leak into additive"))))))
