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

(deftest nested-response-removal-is-breaking-test
  (testing "a removed NESTED response field provides less, so it is breaking"
    ;; Regression: response-lines compared only top-level properties and delegated deeper schemas
    ;; to (widening? new old). Swapping those arguments inverts value-set semantics but not
    ;; object-property semantics, so a dropped nested field read as additive.
    (let [resp (fn [props] (op :response (obj {"a" (obj props)})))
          old-spec (spec {"/api/x" {"get" (resp {"x" {"type" "string"} "y" {"type" "string"}})}})
          new-spec (spec {"/api/x" {"get" (resp {"x" {"type" "string"}})}})]
      (is (breaking? old-spec new-spec))))
  (testing "a new nested response field provides more, so it is additive"
    (let [resp (fn [props] (op :response (obj {"a" (obj props)})))
          old-spec (spec {"/api/x" {"get" (resp {"x" {"type" "string"}})}})
          new-spec (spec {"/api/x" {"get" (resp {"x" {"type" "string"} "extra" {"type" "string"}})}})]
      (is (not (breaking? old-spec new-spec))))))

(deftest description-change-is-doc-only-test
  (testing "a description-only change surfaces as DOC_ONLY rather than vanishing"
    (let [d (openapi-diff/diff (spec {"/api/x" {"get" (op :description "Old.")}})
                               (spec {"/api/x" {"get" (op :description "New.")}}))]
      (is (= 1 (count (:changed d))))
      (is (= :doc-only (:severity (first (:changed d)))))
      (is (zero? (get-in d [:counts :breaking]))))))

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
  (testing "a property literally named $ref is data, not a reference"
    ;; SCIM schemas declare `{"properties": {"$ref": {...}}}`, where `$ref` is a real field name.
    ;; Treating it as a pointer crashed ref resolution against the committed spec.
    (let [scim (fn [t] (obj {"members" {"type" "array"
                                        "items" (obj {"$ref" {"type" t} "value" {"type" "string"}})}}))
          old-spec (spec {"/api/x" {"put" (op :body (scim "string"))}})
          new-spec (spec {"/api/x" {"put" (op :body (scim "integer"))}})]
      (is (map? (openapi-diff/diff old-spec old-spec)) "resolves without throwing")
      (is (breaking? old-spec new-spec) "string -> integer under a $ref-named property still narrows")))
  (testing "a deeply nested change is still compared, not collapsed"
    ;; Deep nesting is ordinary and must be compared field by field. A hop or depth limit would
    ;; replace deep nodes with the same placeholder on both sides, which compares equal and reports
    ;; nothing; `resolve-refs` terminates via `seen` instead, so no limit is needed.
    (let [nest (fn [leaf] (obj {"a" (obj {"b" (obj {"c" (obj {"d" (obj {"e" (obj {"f" leaf})})})})})}))
          old-spec (spec {"/api/x" {"post" (op :body (nest {"enum" ["a" "b" "c"]}))}})
          new-spec (spec {"/api/x" {"post" (op :body (nest {"enum" ["a"]}))}})]
      (is (breaking? old-spec new-spec) "a narrowed enum six levels down is breaking, not invisible")))
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

(def ^:private breaking-request-changes
  [["removed field" (obj {"a" {"type" "string"}}) (obj {})]
   ["now required" (obj {"a" {"type" "string"}}) (obj {"a" {"type" "string"}} ["a"])]
   ["narrowed type"
    (obj {"a" {"oneOf" [{"type" "object"} {"type" "boolean"}]}})
    (obj {"a" {"type" "boolean"}})]
   ["closed schema"
    (obj {"a" {"type" "string"}})
    (assoc (obj {"a" {"type" "string"}}) "additionalProperties" false)]])

(deftest breaking-changes-are-classified-breaking-test
  (testing "every breaking request change is classified breaking, never additive"
    (doseq [[label old-body new-body] breaking-request-changes]
      (let [d (openapi-diff/diff (spec {"/api/x" {"post" (op :body old-body)}})
                                 (spec {"/api/x" {"post" (op :body new-body)}}))]
        (is (pos? (get-in d [:counts :breaking])) (str label " must be breaking"))
        (is (empty? (filter #(= :additive (:severity %)) (:changed d)))
            (str label " must not leak into additive"))))))

(deftest breaking-markers-survive-rendering-test
  ;; Guards the failure mode in mozilla-ai/otari#1315, where a generator dropped breaking-change
  ;; markers at render time and a breaking commit read like any other entry.
  (doseq [[label old-body new-body] breaking-request-changes]
    (let [d (openapi-diff/diff (spec {"/api/x" {"post" (op :body old-body)}})
                               (spec {"/api/x" {"post" (op :body new-body)}}))]
      (testing (str label " prints under the breaking heading of the flat report")
        (is (re-find #"## BREAKING: CHANGED ENDPOINTS \(1\)\n  ~ POST /api/x"
                     (with-out-str (openapi-diff/print-diff d :breaking)))))
      (testing (str label " prints in a breaking group of the grouped report")
        (is (re-find #"## BREAKING - 1 endpoint\n.*\n    POST /api/x"
                     (with-out-str (openapi-diff/print-grouped d :breaking))))))))

(deftest severity-filter-hides-less-severe-findings-test
  (let [d (openapi-diff/diff (spec {"/api/x" {"post" (op :body (obj {"a" {"type" "string"}}))}})
                             (spec {"/api/x" {"post" (op :body (obj {"a" {"type" "string"}
                                                                     "b" {"type" "string"}}))}}))]
    (testing "an additive change is hidden at --severity breaking"
      (is (not (re-find #"POST /api/x" (with-out-str (openapi-diff/print-diff d :breaking)))))
      (is (not (re-find #"POST /api/x" (with-out-str (openapi-diff/print-grouped d :breaking))))))
    (testing "and shown at --severity additive"
      (is (re-find #"POST /api/x" (with-out-str (openapi-diff/print-diff d :additive))))
      (is (re-find #"POST /api/x" (with-out-str (openapi-diff/print-grouped d :additive)))))))

;; ---- direction: arrays, nullability, requiredness, ref chains ----

(deftest response-array-items-are-compared-as-output-test
  (let [resp (fn [props] (op :response {"type" "array" "items" (obj props)}))
        two  (spec {"/api/x" {"get" (resp {"x" {"type" "string"} "y" {"type" "string"}})}})
        one  (spec {"/api/x" {"get" (resp {"x" {"type" "string"}})}})]
    (testing "a field removed from the objects in a response array provides less"
      (is (breaking? two one)))
    (testing "a field added to the objects in a response array provides more"
      (is (not (breaking? one two))))))

(deftest object-nullability-is-compared-test
  (let [o        (obj {"x" {"type" "string"}})
        nullable {"oneOf" [o {"type" "null"}]}]
    (testing "a request object field that no longer accepts null requires more"
      (is (body-change-breaking? (obj {"a" nullable}) (obj {"a" o}))))
    (testing "a response object field that may now be null provides less"
      (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" o}))}})
                     (spec {"/api/x" {"get" (op :response (obj {"a" nullable}))}}))))))

(deftest unconstrained-field-gaining-a-type-is-breaking-test
  (testing "a request field that accepted any value and now accepts only strings requires more"
    (is (body-change-breaking? (obj {"a" {}}) (obj {"a" {"type" "string"}})))))

(deftest response-field-becoming-optional-is-breaking-test
  (testing "a response field that the API may now omit provides less"
    (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}} ["a"]))}})
                   (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}})))))

(deftest long-ref-chain-is-compared-test
  (testing "a change 13 $ref hops down is reported, not hidden behind <deep> on both sides"
    (let [schemas (fn [leaf]
                    (into {"S13" leaf}
                          (for [i (range 13)]
                            [(str "S" i) (obj {"f" {"$ref" (str "#/components/schemas/S" (inc i))}})])))
          body    {"$ref" "#/components/schemas/S0"}]
      (is (breaking? (spec {"/api/x" {"post" (op :body body)}} {"schemas" (schemas {"enum" ["a" "b"]})})
                     (spec {"/api/x" {"post" (op :body body)}} {"schemas" (schemas {"enum" ["a"]})}))))))

;; ---- unions and nullable arrays ----

(deftest removed-union-variant-is-breaking-test
  (testing "a request body that stops accepting one variant of a oneOf requires more"
    (let [a (obj {"kind" {"const" "a"} "x" {"type" "string"}} ["kind"])
          b (obj {"kind" {"const" "b"} "y" {"type" "integer"}} ["kind"])]
      (is (body-change-breaking? {"oneOf" [a b]} {"oneOf" [a]})))))

(deftest nullable-response-array-items-are-compared-test
  (testing "a field removed from the objects in a nullable response array provides less"
    (let [resp (fn [props] (op :response (obj {"a" {"oneOf" [{"type" "array" "items" (obj props)}
                                                             {"type" "null"}]}})))]
      (is (breaking? (spec {"/api/x" {"get" (resp {"x" {"type" "string"} "y" {"type" "string"}})}})
                     (spec {"/api/x" {"get" (resp {"x" {"type" "string"}})}}))))))

;; ---- keywords beyond type, enum, and properties ----

(deftest tightened-bound-is-breaking-test
  (testing "a request field that gains a bound or a narrower map value requires more"
    (doseq [[label old-field new-field]
            [[":int -> ms/PositiveInt" {"type" "integer"} {"type" "integer" "minimum" 1}]
             [":string -> ms/NonBlankString" {"type" "string"} {"type" "string" "minLength" 1}]
             ["map-of values narrowed"
              {"type" "object" "additionalProperties" {"type" "string"}}
              {"type" "object" "additionalProperties" {"type" "integer"}}]]]
      (is (body-change-breaking? (obj {"a" old-field}) (obj {"a" new-field})) label))))

(deftest loosened-bound-is-additive-test
  (testing "the reverse of each tightening requires less of the caller"
    (doseq [[label old-field new-field]
            [["minimum dropped" {"type" "integer" "minimum" 1} {"type" "integer"}]
             ["maxLength raised" {"type" "string" "maxLength" 10} {"type" "string" "maxLength" 20}]
             ["pattern dropped" {"type" "string" "pattern" "^a"} {"type" "string"}]]]
      (is (not (body-change-breaking? (obj {"a" old-field}) (obj {"a" new-field}))) label)))
  (testing "a response bound that tightens provides a narrower set of values"
    (is (not (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "integer"}}))}})
                        (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "integer" "minimum" 1}}))}}))))))

(deftest nullable-enum-is-compared-test
  (let [nullable-enum (fn [vs] (obj {"f" {"oneOf" [{"type" "string" "enum" vs} {"type" "null"}]}}))]
    (testing "a nullable request enum that loses a value requires more"
      (is (body-change-breaking? (nullable-enum ["a" "b"]) (nullable-enum ["a"]))))
    (testing "a nullable request enum that gains a value requires less"
      (is (not (body-change-breaking? (nullable-enum ["a"]) (nullable-enum ["a" "b"])))))
    (testing "a nullable response enum that gains a value can break a client's switch"
      (is (breaking? (spec {"/api/x" {"get" (op :response (nullable-enum ["a"]))}})
                     (spec {"/api/x" {"get" (op :response (nullable-enum ["a" "b"]))}}))))))

(deftest response-map-of-values-test
  (let [resp-spec (fn [r] (spec {"/api/x" {"get" (op :response r)}}))
        setting   (fn [props req] {"type" "object" "additionalProperties" (obj props req)})
        old       (obj {"settings" (setting {"enabled" {"type" "boolean"}
                                             "type" {"enum" ["error" "warning"] "type" "string"}}
                                            ["enabled" "type"])} ["settings"])]
    (testing "map-of value drops a required field"
      (let [new (obj {"settings" (setting {"type" {"enum" ["error" "warning"] "type" "string"}} ["type"])} ["settings"])]
        (is (breaking? (resp-spec old) (resp-spec new)))))
    (testing "map-of value enum widened"
      (let [new (obj {"settings" (setting {"enabled" {"type" "boolean"}
                                           "type" {"enum" ["error" "warning" "info"] "type" "string"}}
                                          ["enabled" "type"])} ["settings"])]
        (is (breaking? (resp-spec old) (resp-spec new)))))
    (testing "nullable map-of value type string -> integer"
      (let [o (obj {"attributes" {"oneOf" [{"additionalProperties" {"type" "string"} "type" "object"} {"type" "null"}]}} ["attributes"])
            n (obj {"attributes" {"oneOf" [{"additionalProperties" {"type" "integer"} "type" "object"} {"type" "null"}]}} ["attributes"])]
        (is (breaking? (resp-spec o) (resp-spec n)))))))

(deftest allof-is-compared-test
  (testing "a request body wrapped in allOf (Malli :and) that gains a required field requires more"
    (is (body-change-breaking? {"allOf" [(obj {"a" {"type" "string"}})]}
                               {"allOf" [(obj {"a" {"type" "string"} "req" {"type" "string"}} ["req"])]})))
  (testing "a request field under allOf that changes string -> integer requires more"
    (is (body-change-breaking? (obj {"f" {"allOf" [{"type" "string"}]}})
                               (obj {"f" {"allOf" [{"type" "integer"}]}}))))
  (testing "a request body under allOf that gains an optional field requires less"
    (is (not (body-change-breaking? {"allOf" [(obj {"a" {"type" "string"}})]}
                                    {"allOf" [(obj {"a" {"type" "string"} "b" {"type" "string"}})]}))))
  (testing "a response under allOf that loses a field provides less"
    (is (breaking? (spec {"/api/x" {"get" (op :response {"allOf" [(obj {"a" {"type" "string"} "b" {"type" "string"}})]})}})
                   (spec {"/api/x" {"get" (op :response {"allOf" [(obj {"a" {"type" "string"}})]})}})))))

(deftest tuple-element-narrowed-is-breaking-test
  (is (body-change-breaking? (obj {"t" {"type" "array" "prefixItems" [{"const" "x"} {"type" "string"}]}})
                             (obj {"t" {"type" "array" "prefixItems" [{"const" "x"} {"type" "integer"}]}}))))

(deftest unmodeled-keyword-change-is-breaking-test
  (testing "a change to a keyword the tool does not model is ranked breaking, not hidden"
    (is (body-change-breaking? (obj {"a" {"type" "array" "contains" {"type" "string"}}})
                               (obj {"a" {"type" "array" "contains" {"type" "integer"}}})))))

(deftest union-variant-edits-are-directional-test
  (let [a  (obj {"kind" {"const" "a"} "x" {"type" "string"}} ["kind"])
        a+ (obj {"kind" {"const" "a"} "x" {"type" "string"} "z" {"type" "string"}} ["kind"])
        b  (obj {"kind" {"const" "b"} "y" {"type" "integer"}} ["kind"])]
    (testing "a request variant that gains an optional field requires less"
      (is (not (body-change-breaking? {"oneOf" [a b]} {"oneOf" [a+ b]}))))
    (testing "a request variant that loses a field requires more"
      (is (body-change-breaking? {"oneOf" [a+ b]} {"oneOf" [a b]})))))

;; ---- response structure ----

(deftest response-nullable-array-plus-items-test
  (let [resp-spec (fn [r] (spec {"/api/x" {"get" (op :response r)}}))]
    (testing "nullable array becomes non-null AND items drop a field"
      (let [o {"oneOf" [{"type" "array" "items" (obj {"id" {"type" "integer"} "name" {"type" "string"}} ["id"])} {"type" "null"}]}
            n {"type" "array" "items" (obj {"id" {"type" "integer"}} ["id"])}]
        (is (breaking? (resp-spec o) (resp-spec n)))))
    (testing "field removed at depth 8"
      (let [nest (fn [leaf] (reduce (fn [acc k] (obj {k acc} [k])) leaf (map #(str "l" %) (range 8))))
            o (nest (obj {"a" {"type" "string"} "b" {"type" "string"}}))
            n (nest (obj {"a" {"type" "string"}}))]
        (is (breaking? (resp-spec o) (resp-spec n)))))))

(deftest response-object-becomes-opaque-test
  (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"id" {"type" "integer"}} ["id"]))}})
                 (spec {"/api/x" {"get" (op :response {"type" "object"})}}))))

(deftest response-schema-removed-is-breaking-test
  (is (breaking? (spec {"/api/x" {"get" (op :response (obj {"a" {"type" "string"}}))}})
                 (spec {"/api/x" {"get" (op)}}))))

(deftest nullable-object-field-closed-is-breaking-test
  (testing "a nullable request object field that starts rejecting undeclared keys requires more"
    (let [o (obj {"x" {"type" "string"}})]
      (is (body-change-breaking? (obj {"a" {"oneOf" [o {"type" "null"}]}})
                                 (obj {"a" {"oneOf" [(assoc o "additionalProperties" false) {"type" "null"}]}}))))))

(deftest param-schema-severity-test
  (let [p (fn [schema] (op :params [{"in" "query" "name" "q" "required" false "schema" schema}]))]
    (testing "a query param enum narrowed requires more"
      (is (breaking? (spec {"/api/x" {"get" (p {"enum" ["a" "b" "c"]})}})
                     (spec {"/api/x" {"get" (p {"enum" ["a"]})}}))))
    (testing "a query param enum widened requires less"
      (is (not (breaking? (spec {"/api/x" {"get" (p {"enum" ["a"]})}})
                          (spec {"/api/x" {"get" (p {"enum" ["a" "b"]})}})))))
    (testing "a free string param becoming an enum requires more"
      (is (breaking? (spec {"/api/x" {"get" (p {"type" "string"})}})
                     (spec {"/api/x" {"get" (p {"enum" ["a"]})}}))))))

;; ---- documentation and rendering ----

(deftest nested-description-change-is-doc-only-test
  (testing "rewording a nested field's description is not a schema change"
    (let [d (openapi-diff/diff
             (spec {"/api/x" {"post" (op :body (obj {"a" {"type" "string" "description" "Old."}}))}})
             (spec {"/api/x" {"post" (op :body (obj {"a" {"type" "string" "description" "New."}}))}}))]
      (is (= [:doc-only] (map :severity (:changed d))))))
  (testing "a field literally named description is still compared"
    (is (body-change-breaking? (obj {"description" {"type" "string"}}) (obj {})))))

(deftest distinct-leaf-changes-stay-distinct-when-grouped-test
  (testing "two different changes to the same field on two endpoints are two groups"
    (let [body     (fn [field] (op :body (obj {"a" field})))
          old-spec (spec {"/api/p" {"post" (body {"type" "integer" "minimum" 1})}
                          "/api/q" {"post" (body {"type" "integer" "maximum" 10})}})
          new-spec (spec {"/api/p" {"post" (body {"type" "integer"})}
                          "/api/q" {"post" (body {"type" "integer"})}})
          groups   (#'openapi-diff/grouped-findings (:changed (openapi-diff/diff old-spec new-spec)))]
      (is (= 2 (count groups))))))

(deftest truncated-brief-names-the-change-test
  (let [models (fn [vs] [{"in" "query" "name" "models" "required" false
                          "schema" {"oneOf" [{"type" "array" "items" {"type" "string" "enum" vs}} {"type" "null"}]}}])
        old    ["dashboard" "table" "dataset" "no_models" "timeline" "snippet" "collection" "transform" "document" "pulse" "metric" "card"]
        new    ["dashboard" "table" "dataset" "no_models" "timeline" "snippet" "collection" "measure" "transform" "document" "pulse" "metric" "card"]
        lines  (findings-text (spec {"/api/x" {"get" (op :params (models old))}})
                              (spec {"/api/x" {"get" (op :params (models new))}}))]
    (is (some #(re-find #"\+\"measure\"" %) lines) "the added enum value is visible in the finding")))

(deftest unconstrained-allof-member-is-ignored-test
  (testing "a Malli :fn predicate adds an empty allOf member, which the spec cannot compare"
    (is (not (body-change-breaking? {"allOf" [(obj {"a" {"type" "string"}}) {}]}
                                    {"allOf" [(obj {"a" {"type" "string"}}) {} {}]})))))

;; ---- shapes the verifier found falling through to doc-only ----

(deftest union-with-one-object-variant-is-compared-test
  (testing "a string | object request field whose string enum narrows requires more"
    (is (body-change-breaking? (obj {"x" {"oneOf" [{"type" "string" "enum" ["a" "b"]} (obj {"k" {"type" "string"}})]}})
                               (obj {"x" {"oneOf" [{"type" "string" "enum" ["a"]} (obj {"k" {"type" "string"}})]}})))))

(deftest keywords-beside-properties-are-compared-test
  (testing "an allOf beside an object's properties that gains a required field requires more"
    (is (body-change-breaking? (assoc (obj {"z" {"type" "string"}}) "allOf" [(obj {"a" {"type" "string"}})])
                               (assoc (obj {"z" {"type" "string"}}) "allOf" [(obj {"a" {"type" "string"} "c" {"type" "string"}} ["c"])]))))
  (testing "minProperties added beside properties requires more"
    (is (body-change-breaking? (obj {"a" {"type" "string"}}) (assoc (obj {"a" {"type" "string"}}) "minProperties" 1)))))

(deftest exclusive-and-inclusive-bounds-compare-as-one-test
  (testing "exclusiveMinimum 0 -> minimum 0 accepts 0 too, so it requires less"
    (is (not (body-change-breaking? (obj {"x" {"type" "integer" "exclusiveMinimum" 0}})
                                    (obj {"x" {"type" "integer" "minimum" 0}})))))
  (testing "minimum 0 -> exclusiveMinimum 0 rejects 0, so it requires more"
    (is (body-change-breaking? (obj {"x" {"type" "integer" "minimum" 0}})
                               (obj {"x" {"type" "integer" "exclusiveMinimum" 0}})))))

(deftest request-body-envelope-is-compared-test
  (let [with-body (fn [content required?] {"description" "" "parameters" []
                                           "requestBody" {"required" required? "content" content}})
        json      {"application/json" {"schema" (obj {"a" {"type" "string"}})}}]
    (testing "a body that becomes required requires more"
      (is (breaking? (spec {"/api/x" {"post" (with-body json false)}})
                     (spec {"/api/x" {"post" (with-body json true)}}))))
    (testing "dropping a content type fails callers that send it"
      (is (breaking? (spec {"/api/x" {"post" (with-body json false)}})
                     (spec {"/api/x" {"post" (with-body {"multipart/form-data" (get json "application/json")} false)}}))))))

(deftest path-variable-rename-is-not-a-removal-test
  (testing "renaming {id} to {card-id} leaves the URL that a caller sends unchanged"
    (let [get-by (fn [n] (op :params [{"in" "path" "name" n "required" true "schema" {"type" "integer"}}]))
          d      (openapi-diff/diff (spec {"/api/card/{id}" {"get" (get-by "id")}})
                                    (spec {"/api/card/{card-id}" {"get" (get-by "card-id")}}))]
      (is (empty? (:removed d)))
      (is (zero? (get-in d [:counts :breaking])))
      (testing "and the report names the real paths"
        (is (= ["GET /api/card/{card-id}"] (map :operation (:changed d))))
        (is (= [:doc-only] (map :severity (:changed d))))))))

(deftest grouped-header-counts-only-visible-severities-test
  (testing "at --severity breaking, a new endpoint is not counted in the header"
    (let [d (openapi-diff/diff (spec {}) (spec {"/api/x" {"get" (op)}}))]
      (is (re-find #"^# 0 distinct changes across 0 endpoints"
                   (with-out-str (openapi-diff/print-grouped d :breaking)))))))

(deftest routes-that-differ-only-by-variable-name-stay-distinct-test
  (testing "two routes that normalize to the same path are both kept"
    (let [s (spec {"/api/db/{id}/schemas" {"get" (op)} "/api/db/{virtual-db}/schemas" {"get" (op)}})]
      (is (= 2 (get-in (openapi-diff/diff s s) [:counts :operations-before]))))))
