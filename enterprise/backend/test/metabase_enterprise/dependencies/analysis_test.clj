(ns metabase-enterprise.dependencies.analysis-test
  "Drift guards for the dependency breakage-check vs. the output-identity hash (#75748).

  The entity-check job re-checks an entity's dependents only when the entity's `output-hash`
  changes. For that to be correct the hash MUST be a superset of everything any dependent's
  breakage check reads of an upstream — if the check ever starts reading a property the hash
  ignores, an upstream change could break a dependent without re-checking it (silent
  under-inclusion). These tests pin that relationship so it can't drift unnoticed."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private base-cols
  "Three products columns used as upstream card 901's stored result-metadata."
  (delay
    (let [mp (deps.tu/mock-metadata-provider {})]
      (->> (lib/returned-columns (lib/query mp (meta/table-metadata :products)))
           (filterv (comp #{"ID" "CATEGORY" "PRICE"} :name))))))

(defn- category-column
  "The CATEGORY column of `query`, matched on either its `:name` or its (possibly deduplicated)
  `:lib/desired-column-alias`. Asserts it was found so a nil never reaches `lib/ref`."
  [query]
  (let [col (m/find-first #(or (= (:name %) "CATEGORY")
                               (= (:lib/desired-column-alias %) "CATEGORY"))
                          (lib/returned-columns query))]
    (assert (some? col) "CATEGORY column must resolve from card 901")
    col))

(def ^:private mbql-dependent-query
  "The pMBQL query for dependent 903: sourced from upstream card 901 and *filtered* on its CATEGORY
  column. Built once, with Lib only, against a pristine card 901 — so the field ref binds CATEGORY
  by id. Filtering (rather than selecting via `lib/with-fields`) is deliberate: an inactive column
  referenced from a `:fields` list is only a `:soft?` error (droppable, hence not breakage), but the
  same ref in a `:filter` is a hard break — which is what lets 903 exercise the active axis. The query
  is fixed; only the upstream's metadata mutates across providers, so dropping/deactivating CATEGORY
  upstream is what flips 903's breakage."
  (delay
    (let [base (deps.tu/mock-metadata-provider {})
          u    (deps.tu/mock-card base {:id      901
                                        :query   (lib/query base (meta/table-metadata :products))
                                        :details {:result-metadata @base-cols}})
          mp1  (deps.tu/mock-metadata-provider {:cards [u]})
          q901 (lib/query mp1 (lib.metadata/card mp1 901))]
      (lib/filter q901 (lib/= (category-column q901) "Widget")))))

(defn- field-overrides
  "Live-field overrides derived from the mutated upstream `cols`. A source-card column with a backing
  field id resolves through the *live* field metadata (which overrides the stored result-metadata), so
  to let the MBQL dependent see an active/type/visibility mutation it must reach the field too — which is
  also what the card's output-identity folds in. Mirrors the breakage-relevant column properties onto the
  backing products field."
  [cols]
  (let [base (deps.tu/mock-metadata-provider {})]
    (keep (fn [col]
            (when-let [field-id (:id col)]
              (merge (lib.metadata/field base field-id)
                     (select-keys col [:active :visibility-type :base-type :effective-type :semantic-type]))))
          cols)))

(defn- provider-with-upstream
  "A mock provider holding upstream card 901 (stored result-metadata = `cols`) plus two dependents:
  a native dependent 902 that selects CATEGORY by name (breaks iff 901 stops exposing the *name*
  CATEGORY), and an MBQL dependent 903 that filters on CATEGORY by id (breaks iff 901 drops or
  deactivates that column). The mutated columns are also reflected onto the backing fields, so id /
  active / type / visibility mutations reach the MBQL resolver — axes the native dependent can't feel."
  [cols]
  (let [base (deps.tu/mock-metadata-provider {})
        u    (deps.tu/mock-card base {:id      901
                                      :query   (lib/query base (meta/table-metadata :products))
                                      :details {:result-metadata cols}})
        mp1  (deps.tu/mock-metadata-provider {:cards [u]})
        dep  (deps.tu/mock-card mp1 {:id 902 :query "SELECT CATEGORY FROM {{#901}}"})
        dep3 (deps.tu/mock-card mp1 {:id 903 :query @mbql-dependent-query})]
    (lib/composed-metadata-provider
     (providers.mock/mock-metadata-provider {:fields (field-overrides cols)})
     (deps.tu/mock-metadata-provider {:cards [u dep dep3]}))))

(defn- broken? [mp card-id]
  (boolean (seq (deps.analysis/check-entity mp :card card-id))))

(defn- u-hash [mp]
  (deps.analysis/output-hash mp :card 901))

(defn- mutations
  "Labeled `[label mutated-cols]` perturbations of the upstream's columns."
  [cols]
  (let [n (count cols)]
    (concat
     (for [i (range n)] [(str "drop-" i)       (into (subvec cols 0 i) (subvec cols (inc i)))])
     (for [i (range n)] [(str "rename-" i)      (assoc-in cols [i :name] (str "renamed_" i))])
     (for [i (range n)] [(str "retype-" i)      (assoc-in cols [i :base-type] :type/Float)])
     (for [i (range n)] [(str "deactivate-" i)  (assoc-in cols [i :active] false)])
     (for [i (range n)] [(str "hide-" i)        (assoc-in cols [i :visibility-type] :sensitive)])
     [["reverse" (vec (reverse cols))]])))

(deftest output-hash-covers-what-the-breakage-check-reads-test
  (testing (str "Any upstream mutation that flips a dependent's breakage must move the upstream's "
                "output-hash (#75748). Catches teaching check-entity a new sensitivity without "
                "folding it into output-identity — e.g. the stored-result-metadata rename that the "
                "native check reads but a returned-columns-based hash masked.")
    (let [cols      @base-cols
          base-mp   (provider-with-upstream cols)
          base-hash (u-hash base-mp)]
      ;; 902 is native (binds CATEGORY by name → exercises drop/rename); 903 is MBQL (binds CATEGORY by
      ;; id → additionally exercises drop/deactivate). Each dependent flips on a different set of axes,
      ;; and every flip must move the upstream hash.
      (doseq [dependent-id [902 903]
              :let [base-broken (broken? base-mp dependent-id)]
              [label mutated]  (mutations cols)
              :let [mp (provider-with-upstream mutated)]
              :when (not= base-broken (broken? mp dependent-id))]
        (is (not= base-hash (u-hash mp))
            (str "mutation '" label "' flips dependent " dependent-id "'s breakage but leaves the "
                 "upstream's output-hash unchanged — output-identity is missing something the "
                 "breakage check reads"))))))

(deftest output-hash-is-sensitive-to-each-floor-property-test
  (testing (str "output-hash changes when any known floor property of an upstream column changes "
                "(#75748). Guards against output-identity silently shrinking below the floor.")
    (let [cols      @base-cols
          base-hash (u-hash (provider-with-upstream cols))]
      (doseq [[label mutated]
              [["drop a column"   (vec (rest cols))]
               ["rename"          (assoc-in cols [0 :name] "renamed")]
               ["base-type"       (assoc-in cols [0 :base-type] :type/Float)]
               ["effective-type"  (assoc-in cols [0 :effective-type] :type/Float)]
               ["semantic-type"   (assoc-in cols [0 :semantic-type] :type/Category)]
               ["fk-target"       (assoc-in cols [0 :fk-target-field-id] 999999)]
               ["deactivate"      (assoc-in cols [0 :active] false)]
               ["visibility"      (assoc-in cols [0 :visibility-type] :sensitive)]
               ["reorder columns" (vec (reverse cols))]]]
        (is (not= base-hash (u-hash (provider-with-upstream mutated)))
            (str "output-hash must change when an upstream column's " label " changes"))))))

;; --- Production (snake_case) drift guard -------------------------------------------------------
;; The mock-based tests above build the upstream's stored result-metadata from `lib/returned-columns`
;; (kebab Lib columns), and mock providers normalize to kebab. Production instead stores a card's
;; `:result_metadata` as raw snake_case, and `lib.metadata/card` on a real app-DB card hands those
;; columns back snake_case. A kebab-only `canonical-column` therefore hashed `nil` for base/effective/
;; semantic-type and fk-target on every real card while the kebab mock guard stayed green (#75748,
;; HIGH-1/MED-1). This test exercises the production shape: a real `:model/Card` with explicitly
;; snake-cased `:result_metadata`, read through the real application-database metadata provider, and
;; asserts the hash MOVES when each stored-column property changes.

(def ^:private snake-result-metadata
  "Two stored columns in the snake_case shape a real card's `:result_metadata` actually holds.
  No `:id` — these are pure stored columns (no backing field), so the card path's live-field fold-in
  is a no-op and the test isolates the stored-column properties `canonical-column` must read."
  [{:name "A" :base_type :type/Integer :effective_type :type/Integer
    :semantic_type :type/PK :display_name "A"}
   {:name "B" :base_type :type/Text :display_name "B"}])

(defn- fresh-card-hash
  "`output-hash` for `card-id` read through a FRESH application-database metadata provider. A new
  provider per call (no ambient `with-metadata-provider-cache`) guarantees we read the card's current
  stored metadata rather than a value cached before the preceding `t2/update!`."
  [db-id card-id]
  (deps.analysis/output-hash (lib-be/application-database-metadata-provider db-id) :card card-id))

(deftest ^:sequential output-hash-is-sensitive-to-stored-snake-properties-test
  (testing (str "On a REAL app-DB card (snake_case stored result_metadata read through the real "
                "provider), output-hash moves when each breakage-relevant stored property changes "
                "(#75748). The kebab-shaped mock guards above can't see this — mock providers "
                "normalize to kebab, while production stores snake.")
    (mt/with-premium-features #{:dependencies}
      ;; the query is incidental here — output-hash reads the stored result_metadata, never the query
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query   (mt/native-query {:query "SELECT 1"})
                                                :database_id     (mt/id)
                                                :result_metadata snake-result-metadata}]
        (let [db-id     (mt/id)
              base-hash (fresh-card-hash db-id card-id)]
          (doseq [[label mutated]
                  [["base_type"          (assoc-in snake-result-metadata [0 :base_type] :type/Float)]
                   ["effective_type"     (assoc-in snake-result-metadata [0 :effective_type] :type/Float)]
                   ["semantic_type"      (assoc-in snake-result-metadata [0 :semantic_type] :type/Category)]
                   ["fk_target_field_id" (assoc-in snake-result-metadata [0 :fk_target_field_id] 999999)]
                   ["drop a column"      [(first snake-result-metadata)]]
                   ["rename"             (assoc-in snake-result-metadata [0 :name] "renamed")]]]
            (t2/update! :model/Card card-id {:result_metadata mutated})
            (let [mutated-hash (fresh-card-hash db-id card-id)]
              ;; restore before the next mutation so each axis is measured against the same baseline
              (t2/update! :model/Card card-id {:result_metadata snake-result-metadata})
              (is (not= base-hash mutated-hash)
                  (str "output-hash must change when a real card's stored " label " changes — "
                       "a kebab-only canonical-column would read nil for the type axes and miss this")))))))))

;; --- Segment soundness: breaking a segment must NOT flip a dependent's breakage ----------------
;; `output-identity :segment` returns a CONSTANT `[:segment id]` token, so a segment edit never
;; moves the segment's output-hash and therefore never re-checks the segment's dependents
;; (`analyze-and-propagate!` only propagates when `upsert-analysis!` reports a change). That is sound
;; ONLY IF no dependent's breakage check resolves anything against the segment's `:definition` — i.e.
;; breaking the segment cannot flip a card that *uses* the segment. `find-bad-refs` walks the card's
;; `:field` clauses, not the `[:segment id]` clause's definition (segment expansion happens in QP
;; middleware, not in the analysis path), so a broken segment makes the *segment* report broken while
;; its dependent card stays clean. This test pins exactly that: if a future change ever teaches
;; `find-bad-refs` to expand and validate segment definitions, the dependent's breakage WOULD flip
;; here while the segment hash stays constant — and this test fails, forcing the segment hash to
;; become definition-sensitive (#75748).

(def ^:private segment-soundness-fixture
  "A clean provider plus a broken one, sharing one segment (700) and one card (800) that uses it.

  The segment's definition filters PRODUCTS on PRICE; card 800 is PRODUCTS filtered by the segment
  (a `[:segment 700]` clause, produced by `lib/filter` on the segment metadata). The broken provider
  deactivates the PRICE field the segment's definition binds — the same Lib-level break the mutation
  guards above use — which makes the *segment's own* `check-entity` non-empty while leaving the
  card's untouched. Built once; everything is Lib-constructed (no hand-written MBQL)."
  (delay
    (let [base      (deps.tu/mock-metadata-provider {})
          prods-q   (lib/query base (meta/table-metadata :products))
          price-col (m/find-first #(= (:name %) "PRICE") (lib/returned-columns prods-q))
          _         (assert (some? price-col) "PRICE column must resolve from products")
          seg-def   (lib/filter prods-q (lib/> price-col 100))
          segment   {:lib/type   :metadata/segment
                     :id         700
                     :name       "Expensive products"
                     :table-id   (meta/id :products)
                     ;; stored legacy, as production / `mock-card` does
                     :definition (lib.convert/->legacy-MBQL seg-def)}
          mp-seg    (lib/composed-metadata-provider
                     base
                     (providers.mock/mock-metadata-provider {:segments [segment]}))
          ;; card 800 USES the segment: PRODUCTS filtered by the `[:segment 700]` clause
          card-q    (-> (lib/query mp-seg (meta/table-metadata :products))
                        (lib/filter (lib.metadata/segment mp-seg 700)))
          card      (deps.tu/mock-card mp-seg {:id 800 :query card-q})
          clean-mp  (lib/composed-metadata-provider
                     base
                     (providers.mock/mock-metadata-provider {:segments [segment] :cards [card]}))
          ;; break the segment by deactivating the PRICE field its definition binds
          price-fld (lib.metadata/field base (meta/id :products :price))
          broken-mp (lib/composed-metadata-provider
                     (providers.mock/mock-metadata-provider {:fields [(assoc price-fld :active false)]})
                     clean-mp)]
      {:clean clean-mp :broken broken-mp})))

(deftest breaking-a-segment-does-not-flip-a-dependent-cards-breakage-test
  (testing (str "Breaking a segment makes the SEGMENT report broken but does NOT flip a card that "
                "uses it, and the segment's output-hash is a constant token unaffected by the break "
                "(#75748). This is what makes the constant `output-identity :segment` sound: no "
                "dependent breakage check resolves against a segment's definition. If `find-bad-refs` "
                "ever learns to expand segments, this fails and forces the segment hash to track the "
                "definition.")
    (let [{clean-mp :clean broken-mp :broken} @segment-soundness-fixture]
      (testing "baseline: the segment and the card that uses it are both clean"
        (is (empty? (deps.analysis/check-entity clean-mp :segment 700)))
        (is (empty? (deps.analysis/check-entity clean-mp :card 800))
            "card 800 uses segment 700 and is clean before the break"))
      (testing "after the break: the SEGMENT is broken but the dependent CARD is not"
        (is (seq (deps.analysis/check-entity broken-mp :segment 700))
            "the segment's own breakage check flips — its definition binds the now-inactive PRICE")
        (is (empty? (deps.analysis/check-entity broken-mp :card 800))
            (str "the card that USES the segment stays clean — breaking the segment did NOT flip "
                 "its breakage. If this fails, find-bad-refs now resolves against segment "
                 "definitions and the constant segment output-hash is no longer sound.")))
      (testing "the segment's output-hash is the constant token — unchanged across the break"
        (is (= (deps.analysis/output-hash clean-mp :segment 700)
               (deps.analysis/output-hash broken-mp :segment 700))
            "segment output-hash must be definition-insensitive (the constant `[:segment id]` token)")))))
