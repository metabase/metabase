(ns metabase.api.request-posture-test
  "A namespace opted in to `{:api/undeclared-keys :report}` or `:reject` only rejects undeclared keys if its request
  schemas actually constrain their keys. This walks every request schema those namespaces expose and fails on the
  constructs [[constrains-nothing]] lists.

  It walks resolved schemas rather than grepping source because a schema can be a registry ref from another module,
  which no textual check can follow."
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.util :as mut]
   [metabase.api-routes.core :as api-routes]
   [metabase.api.macros :as api.macros]
   [metabase.config.core :as config]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(comment api-routes/keep-me)

(def ^:private max-depth
  "Schemas can be mutually recursive, so the walk is depth-capped rather than cycle-free."
  18)

(defn- constrains-nothing
  "The kind of unconstrained construct `schema` is, or nil if it constrains something."
  [schema]
  (let [schema-type (mc/type schema)]
    (cond
      (and (= schema-type :map) (false? (:closed (mc/properties schema)))) :open-map
      ;; `some?` and `any?` are not maps, so `closed-schema` has nothing to close: a value typed with either takes an
      ;; arbitrary nested bag of keys
      (contains? #{:any 'any? 'some?} schema-type)                         :any
      (contains? #{:map-of 'map?} schema-type)                             :map-of)))

(defn- unconstrained-nodes
  "Every constrains-nothing node in `schema`, with the path to it and the registry refs traversed to reach it."
  [schema]
  (let [seen (atom #{}), found (atom [])]
    (letfn [(walk [schema path chain depth]
              (when (< depth max-depth)
                ;; children include map-entry keys and properties maps, which are not schemas -- skip those, but let
                ;; a StackOverflowError from a recursive schema through rather than read it as "nothing to report"
                (when-let [schema (try (mc/schema schema) (catch clojure.lang.ExceptionInfo _ nil))]
                  (let [schema-type (mc/type schema)
                        children    (mc/children schema)]
                    (when-let [kind (constrains-nothing schema)]
                      (swap! found conj {:kind kind, :path path, :chain chain}))
                    (if (contains? #{:ref :schema :malli.core/schema} schema-type)
                      ;; a bare ::qualified/keyword ref keeps the keyword in the FORM while its children are already
                      ;; the resolved schema, so the ref has to be read off the form or the chain comes back empty
                      (let [form (mc/form schema)
                            ref  (if (qualified-keyword? form)
                                   form
                                   (when (qualified-keyword? (first children)) (first children)))]
                        (when-not (contains? @seen [(or ref form) path])
                          (swap! seen conj [(or ref form) path])
                          (walk (mc/deref schema) path (cond-> chain ref (conj ref)) (inc depth))))
                      (doseq [[i child] (map-indexed vector children)]
                        (if (and (vector? child) (= 3 (count child)) (keyword? (first child)))
                          (walk (nth child 2) (conj path (first child)) chain (inc depth))
                          (walk child (conj path i) chain (inc depth)))))))))]
      (walk schema [] [] 0))
    @found))

(defn- opted-in-namespaces []
  (filter (comp #{:report :reject} :api/undeclared-keys meta) (all-ns)))

(defn- opted-in-request-schemas
  "Every `:query`/`:body` schema an opted-in namespace declares, tagged with where it came from."
  []
  (for [nmspace               (opted-in-namespaces)
        [[method route] info] (api.macros/ns-routes nmspace)
        params-type           [:query :body]
        ;; `[:form :params ...]`, not `[:params ...]` -- reading the wrong key returns nil for every endpoint and
        ;; reports a clean sweep that means nothing
        :let                  [schema (get-in info [:form :params params-type :schema])]
        :when                 schema]
    {:ns (ns-name nmspace), :method method, :route route, :params-type params-type, :schema schema}))

(defn- findings
  "Every unconstrained request-schema node across every opted-in namespace."
  []
  (vec
   (for [{:keys [schema] :as source} (opted-in-request-schemas)
         node                        (unconstrained-nodes schema)]
     (merge (dissoc source :schema) node))))

(defn- open-map-nested
  "An `{:closed false}` map buried `depth` `[:map [:a ...]]` levels down, for pinning [[max-depth]]'s reach."
  [depth]
  (reduce (fn [schema _] [:map [:a schema]])
          [:map {:closed false} [:x :int]]
          (range depth)))

(deftest ^:parallel walker-detects-what-it-claims-to-test
  (testing "a detector that cannot detect reports a clean sweep forever, so pin it against known positives..."
    (is (= [:open-map] (map :kind (unconstrained-nodes ms/Map))))
    (is (= [:open-map] (map :kind (unconstrained-nodes [:map {:closed false} [:a :int]]))))
    (is (= [:any]      (map :kind (unconstrained-nodes [:map [:a :any]]))))
    (is (= [:map-of]   (map :kind (unconstrained-nodes [:map-of :int :int]))))
    (is (= [:any]      (map :kind (unconstrained-nodes [:map [:a some?]]))))
    (is (= [[:q]]      (map :path (unconstrained-nodes [:map [:q ms/Map]])))))
  (testing "...and a known negative"
    (is (= [] (unconstrained-nodes [:map [:a :int] [:b [:sequential [:map [:c :string]]]]]))))
  (testing "the depth cap is a blind spot, not a safety net -- pin where it starts and stops seeing"
    (is (= [:open-map] (map :kind (unconstrained-nodes (open-map-nested (dec max-depth))))))
    (is (= []          (unconstrained-nodes (open-map-nested (inc max-depth)))))))

(deftest ^:parallel opted-in-request-schemas-can-be-closed-test
  (testing "a strict endpoint closes its schema and builds an explainer on its first request, not at load time, so
           a schema that cannot survive that would surface as a 500 to whoever got there first -- prove here instead"
    (is (= [] (vec (keep (fn [{:keys [schema] :as source}]
                           (try
                             ;; the same call the strict decode path makes on its first request
                             (mr/explainer (mut/closed-schema (mc/schema schema)))
                             nil
                             (catch Throwable e
                               (assoc (dissoc source :schema) :threw (ex-message e)))))
                         (opted-in-request-schemas)))))))

(deftest ^:parallel opted-in-namespaces-declare-every-request-key-test
  (testing "namespaces that promise strict request params have no schema construct that accepts arbitrary input"
    (is (= [] (findings))))
  (when config/ee-available?
    (testing "and the sweep is actually seeing them -- a renamed metadata key would otherwise pass silently"
      (is (contains? (set (map ns-name (opted-in-namespaces)))
                     'metabase-enterprise.content-diagnostics.api)))))
