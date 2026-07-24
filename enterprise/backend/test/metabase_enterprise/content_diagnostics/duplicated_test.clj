(ns metabase-enterprise.content-diagnostics.duplicated-test
  "The `duplicated` checker (match mode `name`) flags clusters of ≥2 same-type non-archived entities
  whose normalized names collide, stamping the peer count in the top-level `duplicate_count` column and
  freezing the `normalized_name`/`duplicate_entity_ids` envelope in `details` at scan time. The
  `/duplicated` endpoint serves them with hydrated same-type peers and the shared filter/sort/pagination
  envelope."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- scope-prefix
  "Unique per-test entity-name prefix - both the checker's name grouping and the API reads are scoped by
  it (the checker scans instance-wide and the findings table is shared across tests)."
  []
  (str "cd-" (mt/random-name)))

(defn- duplicated-findings-by-entity!
  "Run a scan and index its `:duplicated` findings by `[entity-type entity-id]`."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (into {}
          (map (juxt (juxt :entity_type :entity_id) identity))
          (t2/select :model/ContentDiagnosticsFinding :scan_id scan-id :finding_type :duplicated))))

;;; --------------------------------------------- checker --------------------------------------------------

(deftest duplicated-checker-flags-same-name-clusters-test
  (testing "same-type same-name pairs are flagged for all four covered types; a unique name is not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)]
          (mt/with-temp
            [:model/Collection {coll-id :id}  {}
             :model/Card       {card-a :id}   {:collection_id coll-id :name (str prefix " Revenue")}
             :model/Card       {card-b :id}   {:collection_id coll-id :name (str prefix " Revenue")}
             :model/Card       {unique-c :id} {:collection_id coll-id :name (str prefix " One Of A Kind")}
             :model/Dashboard  {dash-a :id}   {:collection_id coll-id :name (str prefix " Ops")}
             :model/Dashboard  {dash-b :id}   {:collection_id coll-id :name (str prefix " Ops")}
             :model/Document   {doc-a :id}    {:collection_id coll-id :name (str prefix " Notes")}
             :model/Document   {doc-b :id}    {:collection_id coll-id :name (str prefix " Notes")}
             ;; transform has no archived column - every row participates
             :model/Transform  {xf-a :id}     {:name (str prefix " ETL")}
             :model/Transform  {xf-b :id}     {:name (str prefix " ETL")}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (testing "card pair: peers are symmetric, duplicate_count 1, the details envelope is frozen"
                (let [f (by-entity [:card card-a])]
                  (is (some? f))
                  (is (= 1 (:duplicate_count f)))
                  (is (= {:normalized_name      (u/lower-case-en (str prefix " Revenue"))
                          :duplicate_entity_ids [card-b]}
                         (:details f)))
                  (testing "the other magnitude columns stay null on duplicated findings"
                    (is (nil? (:duration_ms f)))
                    (is (nil? (:last_active_at f)))))
                (is (= [card-a] (get-in (by-entity [:card card-b]) [:details :duplicate_entity_ids]))))
              (testing "a unique name yields no finding"
                (is (nil? (by-entity [:card unique-c]))))
              (testing "dashboard, document, and transform pairs are each flagged with each other as peer"
                (doseq [[etype a b] [[:dashboard dash-a dash-b]
                                     [:document  doc-a  doc-b]
                                     [:transform xf-a   xf-b]]]
                  (let [f (by-entity [etype a])]
                    (is (some? f))
                    (is (= 1 (:duplicate_count f)))
                    (is (= [b] (get-in f [:details :duplicate_entity_ids])))))))))))))

(deftest duplicated-checker-normalization-test
  (testing "names collide under lowercase + trim + internal-whitespace collapse; commas stay meaningful"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             ;; case-insensitive
             :model/Card {case-a :id} {:collection_id coll-id :name (str prefix " Rev")}
             :model/Card {case-b :id} {:collection_id coll-id :name (str prefix " REV")}
             ;; leading/trailing whitespace
             :model/Card {pad-a :id}  {:collection_id coll-id :name (str " " prefix " pad ")}
             :model/Card {pad-b :id}  {:collection_id coll-id :name (str prefix " pad")}
             ;; internal whitespace collapses
             :model/Card {gap-a :id}  {:collection_id coll-id :name (str prefix " a  gap")}
             :model/Card {gap-b :id}  {:collection_id coll-id :name (str prefix " a gap")}
             ;; a comma is NOT whitespace - these two must stay distinct
             :model/Card {comma-a :id} {:collection_id coll-id :name (str prefix " a, b")}
             :model/Card {comma-b :id} {:collection_id coll-id :name (str prefix " a b")}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (testing "case-insensitive match; normalized_name is the normalized (lowercased) form"
                (let [f (by-entity [:card case-a])]
                  (is (some? f))
                  (is (= (u/lower-case-en (str prefix " Rev"))
                         (get-in f [:details :normalized_name])))
                  (is (= [case-b] (get-in f [:details :duplicate_entity_ids])))))
              (testing "leading/trailing whitespace is ignored"
                (is (= [pad-b] (get-in (by-entity [:card pad-a]) [:details :duplicate_entity_ids]))))
              (testing "internal whitespace runs collapse to one space"
                (is (= [gap-b] (get-in (by-entity [:card gap-a]) [:details :duplicate_entity_ids]))))
              (testing "a comma-separated name does not match its space-separated sibling"
                (is (nil? (by-entity [:card comma-a])))
                (is (nil? (by-entity [:card comma-b])))))))))))

(deftest duplicated-checker-unicode-normalization-test
  (testing "diacritics fold, Unicode whitespace collapses, and zero-width invisibles are stripped before comparison"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             ;; combining-mark accents fold: Café Über ≡ Cafe Uber
             :model/Card {accent-a :id} {:collection_id coll-id :name (str prefix " Café Über")}
             :model/Card {accent-b :id} {:collection_id coll-id :name (str prefix " Cafe Uber")}
             ;; a non-breaking space (U+00A0) collapses like a regular space
             :model/Card {nbsp-a :id} {:collection_id coll-id :name (str prefix " a\u00A0gap")}
             :model/Card {nbsp-b :id} {:collection_id coll-id :name (str prefix " a gap")}
             ;; an em space (U+2003, another Unicode whitespace form) collapses too
             :model/Card {emsp-a :id} {:collection_id coll-id :name (str prefix " b\u2003gap")}
             :model/Card {emsp-b :id} {:collection_id coll-id :name (str prefix " b gap")}
             ;; a zero-width space (U+200B) is invisible - stripped, so the surrounding text joins
             :model/Card {zwsp-a :id} {:collection_id coll-id :name (str prefix " c\u200Bjoin")}
             :model/Card {zwsp-b :id} {:collection_id coll-id :name (str prefix " cjoin")}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (testing "combining-mark accents fold (Café Über ≡ Cafe Uber)"
                (is (= [accent-b] (get-in (by-entity [:card accent-a]) [:details :duplicate_entity_ids]))))
              (testing "a non-breaking space collapses to a regular space"
                (is (= [nbsp-b] (get-in (by-entity [:card nbsp-a]) [:details :duplicate_entity_ids]))))
              (testing "an em space collapses to a regular space"
                (is (= [emsp-b] (get-in (by-entity [:card emsp-a]) [:details :duplicate_entity_ids]))))
              (testing "a zero-width space is stripped, joining the surrounding text"
                (is (= [zwsp-b] (get-in (by-entity [:card zwsp-a]) [:details :duplicate_entity_ids])))))))))))

(deftest duplicated-checker-clusters-cards-across-sub-kinds-test
  (testing "cards cluster by normalized name regardless of sub-kind: a question and a model sharing a name are duplicates"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             :model/Card {question :id} {:collection_id coll-id :name (str prefix " Sales") :type :question}
             :model/Card {model :id}    {:collection_id coll-id :name (str prefix " Sales") :type :model}]
            (let [by-entity        (duplicated-findings-by-entity!)
                  question-finding (by-entity [:card question])
                  model-finding    (by-entity [:card model])]
              (testing "the question and the model are mutual peers, entity_type :card"
                (is (some? question-finding))
                (is (some? model-finding))
                (is (= :card (:entity_type question-finding)))
                (is (= [model] (get-in question-finding [:details :duplicate_entity_ids])))
                (is (= [question] (get-in model-finding [:details :duplicate_entity_ids])))))))))))

(deftest duplicated-checker-excludes-archived-test
  (testing "archived cards/dashboards/documents neither get findings nor count as peers"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             ;; a pair whose second member is archived - no cluster survives
             :model/Card      {pair-live :id}     {:collection_id coll-id :name (str prefix " Pair")}
             :model/Card      {pair-archived :id} {:collection_id coll-id :name (str prefix " Pair") :archived true}
             :model/Dashboard {dpair-live :id}    {:collection_id coll-id :name (str prefix " DPair")}
             :model/Dashboard {dpair-archived :id} {:collection_id coll-id :name (str prefix " DPair") :archived true}
             :model/Document  {doc-live :id}      {:collection_id coll-id :name (str prefix " Doc")}
             :model/Document  {doc-archived :id}  {:collection_id coll-id :name (str prefix " Doc") :archived true}
             ;; a trio whose third member is archived - the two live ones still cluster, count 1 not 2
             :model/Card {trio-a :id}        {:collection_id coll-id :name (str prefix " Trio")}
             :model/Card {trio-b :id}        {:collection_id coll-id :name (str prefix " Trio")}
             :model/Card {trio-archived :id} {:collection_id coll-id :name (str prefix " Trio") :archived true}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (testing "a live entity whose only name-twin is archived is not flagged"
                (is (nil? (by-entity [:card pair-live])))
                (is (nil? (by-entity [:dashboard dpair-live])))
                (is (nil? (by-entity [:document doc-live]))))
              (testing "archived entities are never flagged themselves"
                (is (nil? (by-entity [:card pair-archived])))
                (is (nil? (by-entity [:dashboard dpair-archived])))
                (is (nil? (by-entity [:document doc-archived]))))
              (testing "an archived member drops out of a surviving cluster's peer set"
                (let [f (by-entity [:card trio-a])]
                  (is (some? f))
                  (is (= 1 (:duplicate_count f)))
                  (is (= [trio-b] (get-in f [:details :duplicate_entity_ids])))
                  (is (nil? (by-entity [:card trio-archived]))))))))))))

(deftest duplicated-checker-skips-blank-names-test
  (testing "whitespace-only names - including Unicode whitespace and zero-width invisibles - never cluster; unknown is not duplicate"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {coll-id :id} {}
           :model/Dashboard {blank-a :id} {:collection_id coll-id :name "   "}
           :model/Dashboard {blank-b :id} {:collection_id coll-id :name "   "}
           ;; NBSP-only and zero-width-only names normalize to blank too, so they never cluster
           :model/Dashboard {nbsp-a :id} {:collection_id coll-id :name "\u00A0\u00A0"}
           :model/Dashboard {nbsp-b :id} {:collection_id coll-id :name "\u00A0\u00A0"}
           :model/Dashboard {zwsp-a :id} {:collection_id coll-id :name "\u200B"}
           :model/Dashboard {zwsp-b :id} {:collection_id coll-id :name "\u200B"}]
          (let [by-entity (duplicated-findings-by-entity!)]
            (are [d] (nil? (by-entity [:dashboard d]))
              blank-a blank-b nbsp-a nbsp-b zwsp-a zwsp-b)))))))

(deftest duplicated-checker-cluster-of-three-test
  (testing "every member of a cluster of 3 gets duplicate_count 2 and the other two as peers"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Nightly Sync")]
          (mt/with-temp [:model/Transform {xf-a :id} {:name nm}
                         :model/Transform {xf-b :id} {:name nm}
                         :model/Transform {xf-c :id} {:name nm}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (doseq [[member peers] {xf-a #{xf-b xf-c}
                                      xf-b #{xf-a xf-c}
                                      xf-c #{xf-a xf-b}}]
                (let [f (by-entity [:transform member])]
                  (is (some? f))
                  (is (= 2 (:duplicate_count f)))
                  (is (= peers (set (get-in f [:details :duplicate_entity_ids])))))))))))))

(deftest duplicated-checker-same-type-only-test
  (testing "a name shared across different entity types is not a duplicate"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Shared Name")]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card      {card-id :id} {:collection_id coll-id :name nm}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id :name nm}
                         :model/Document  {doc-id :id}  {:collection_id coll-id :name nm}
                         :model/Transform {xf-id :id}   {:name nm}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (is (nil? (by-entity [:card card-id])))
              (is (nil? (by-entity [:dashboard dash-id])))
              (is (nil? (by-entity [:document doc-id])))
              (is (nil? (by-entity [:transform xf-id]))))))))))

(deftest duplicated-supersession-test
  (testing "renaming one of a pair to be unique supersedes both findings on the next scan"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Sales")]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {card-a :id} {:collection_id coll-id :name nm}
                         :model/Card {card-b :id} {:collection_id coll-id :name nm}]
            (let [by-entity (duplicated-findings-by-entity!)
                  fa        (by-entity [:card card-a])
                  fb        (by-entity [:card card-b])]
              (is (some? fa))
              (is (some? fb))
              (t2/update! :model/Card card-b {:name (str prefix " Renamed Unique")})
              (scan/scan!)
              (testing "both prior findings are soft-invalidated and neither entity has an active one"
                (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding :id (:id fa)))))
                (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding :id (:id fb)))))
                (is (empty? (t2/select :model/ContentDiagnosticsFinding
                                       :finding_type :duplicated :invalidated_at nil
                                       :entity_type :card :entity_id [:in [card-a card-b]])))))))))))

;;; ------------------------------------------------- API --------------------------------------------------

(deftest duplicated-api-hydration-test
  (testing "GET /duplicated serves findings with hydrated context + same-type peers"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Sales Model")]
          (mt/with-temp
            [:model/Collection {coll-id :id} {:name "Analytics"}
             :model/Card {card-a :id} {:collection_id coll-id :name nm :type :model
                                       :creator_id (mt/user->id :rasta) :view_count 4}
             :model/Card {card-b :id} {:collection_id coll-id :name nm :type :model :view_count 7}]
            (scan/scan!)
            (let [resp  (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/duplicated"
                                              :query prefix)
                  by-id (into {} (map (juxt (juxt :entity_type :entity_id) identity)) (:data resp))]
              (testing "the envelope carries last_scan_at + total"
                (is (contains? resp :last_scan_at))
                (is (= 2 (:total resp))))
              (let [f (by-id ["card" card-a])]
                (is (some? f))
                (is (= nm (:entity_display_name f)))
                (testing "top-level duplicate_count + normalized_name in details"
                  (is (= 1 (:duplicate_count f)))
                  (is (= (u/lower-case-en nm) (get-in f [:details :normalized_name]))))
                (testing "the flagged entity's own live view_count is hydrated into details"
                  (is (= 4 (get-in f [:details :view_count]))))
                (testing "the peer hydrates with its card sub-kind and live view_count"
                  (is (= [{:id card-b :name nm :entity_type "card" :card_type "model" :view_count 7}]
                         (get-in f [:details :duplicate_entities]))))
                (testing "the raw stored peer ids are not served"
                  (is (not (contains? (:details f) :duplicate_entity_ids))))
                (testing "shared display hydration: collection breadcrumb + denormalized creator"
                  (is (= coll-id (get-in f [:details :collection :id])))
                  (is (= (mt/user->id :rasta) (get-in f [:details :creator :id]))))))))))))

(deftest duplicated-api-subject-view-count-test
  (testing "GET /duplicated hydrates each finding's own live view_count into details; a transform omits it"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {coll-id :id}  {}
           :model/Collection {tcoll-id :id} {:namespace "transforms"}
           :model/Card       {card-id :id}  {:collection_id coll-id :view_count 7}
           :model/Dashboard  {dash-id :id}  {:collection_id coll-id :view_count 12}
           :model/Document   {doc-id :id}   {:collection_id coll-id :view_count 3}
           :model/Transform  {xform-id :id} {:collection_id tcoll-id}]
          (let [prefix (scope-prefix)]
            (doseq [[etype eid] [[:card card-id] [:dashboard dash-id] [:document doc-id] [:transform xform-id]]]
              (t2/insert! :model/ContentDiagnosticsFinding
                          {:scan_id         "vc"
                           :entity_type     etype
                           :entity_id       eid
                           :entity_name     (str prefix "-" (name etype))
                           :finding_type    :duplicated
                           :duplicate_count 1
                           :details         {:normalized_name      "x"
                                             :duplicate_entity_ids []}}))
            (let [by-type (into {} (map (juxt :entity_type identity))
                                (:data (mt/user-http-request :crowberto :get 200
                                                             "ee/content-diagnostics/duplicated" :query prefix)))]
              (testing "card/dashboard/document each carry their own live view_count in details"
                (are [etype vc] (= vc (get-in by-type [etype :details :view_count]))
                  "card"      7
                  "dashboard" 12
                  "document"  3))
              (testing "a transform (no view_count column) omits the key entirely from details"
                (is (contains? by-type "transform"))
                (is (not (contains? (get-in by-type ["transform" :details]) :view_count))))
              (testing "view_count is hydrated live at read time, not frozen at scan time"
                (t2/update! :model/Card card-id {:view_count 99})
                (let [card-f (some #(when (= "card" (:entity_type %)) %)
                                   (:data (mt/user-http-request :crowberto :get 200
                                                                "ee/content-diagnostics/duplicated" :query prefix)))]
                  (is (= 99 (get-in card-f [:details :view_count]))))))))))))

(deftest duplicated-api-filter-and-sort-test
  (testing "GET /duplicated filters by entity-types/min-duplicate-count and sorts by duplicate-count/name"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Collection {tcoll-id :id} {:namespace "transforms"}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}
                         :model/Transform {xform-id :id} {:collection_id tcoll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (perms/grant-collection-read-permissions! (perms/all-users-group) tcoll-id)
            (let [prefix (scope-prefix)
                  insert (fn [etype eid nm dup-count]
                           (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id         "s"
                                                             :entity_type     etype
                                                             :entity_id       eid
                                                             :entity_name     (str prefix " " nm)
                                                             :finding_type    :duplicated
                                                             :duplicate_count dup-count
                                                             :details         {:normalized_name      nm
                                                                               :duplicate_entity_ids []}})))
                  card-fid  (insert :card      card-id  "Alpha" 1)
                  dash-fid  (insert :dashboard dash-id  "Beta"  2)
                  xform-fid (insert :transform xform-id "Gamma" 4)
                  ids   (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                "ee/content-diagnostics/duplicated"
                                                                :query prefix kvs)))))
                  order (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                            "ee/content-diagnostics/duplicated"
                                                            :query prefix kvs))))]
              (testing "no filter → all three"
                (is (= #{card-fid dash-fid xform-fid} (ids))))
              (testing "entity-types (single + multi)"
                (is (= #{card-fid} (ids :entity-types "card")))
                (is (= #{card-fid dash-fid} (ids :entity-types ["card" "dashboard"]))))
              (testing "min-duplicate-count floor is inclusive - a pair (count 1) drops at min 2, a trio (count 2) stays"
                (is (= #{dash-fid xform-fid} (ids :min-duplicate-count "2")))
                (is (= #{xform-fid} (ids :min-duplicate-count "3"))))
              (testing "sort by duplicate-count, both directions"
                (is (= [card-fid dash-fid xform-fid] (order :sort-column "duplicate-count" :sort-direction "asc")))
                (is (= [xform-fid dash-fid card-fid] (order :sort-column "duplicate-count" :sort-direction "desc"))))
              (testing "sort by name (Alpha < Beta < Gamma), both directions"
                (is (= [card-fid dash-fid xform-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [xform-fid dash-fid card-fid] (order :sort-column "name" :sort-direction "desc")))))))))))

(deftest duplicated-api-paginates-test
  (testing "GET /duplicated honors limit/offset and reports the full valid total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c1 :id} {:collection_id coll-id}
                         :model/Card {c2 :id} {:collection_id coll-id}
                         :model/Card {c3 :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix (scope-prefix)]
              (doseq [cid [c1 c2 c3]]
                (t2/insert! :model/ContentDiagnosticsFinding
                            {:scan_id "p" :entity_type :card :entity_id cid
                             :entity_name (str prefix "-" cid)
                             :finding_type :duplicated :duplicate_count 1
                             :details {:normalized_name "x" :duplicate_entity_ids []}}))
              (let [page (fn [limit offset]
                           (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/duplicated"
                                                 :query prefix :limit limit :offset offset))]
                (testing "limit caps the page; total reflects the full valid set; limit/offset echoed back"
                  (let [r (page 2 0)]
                    (is (= 2 (count (:data r))))
                    (is (= 3 (:total r)))
                    (is (= 2 (:limit r)))
                    (is (= 0 (:offset r)))))
                (testing "offset advances to the remainder"
                  (is (= 1 (count (:data (page 2 2))))))))))))))

(deftest duplicated-api-hides-unreadable-peers-test
  (testing "GET /duplicated omits peers the caller can't read - the count can exceed the hydrated list"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}
                         :model/Card {open-card :id}   {:collection_id readable}
                         :model/Card {secret-card :id} {:collection_id unreadable}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [prefix (scope-prefix)
                  fid    (first (t2/insert-returning-pks!
                                 :model/ContentDiagnosticsFinding
                                 {:scan_id "perm" :entity_type :card :entity_id open-card
                                  :entity_name (str prefix "-card")
                                  :finding_type :duplicated :duplicate_count 1
                                  :details {:normalized_name      "x"
                                            :duplicate_entity_ids [secret-card]}}))
                  finding (fn [user]
                            (some #(when (= fid (:id %)) %)
                                  (:data (mt/user-http-request user :get 200
                                                               "ee/content-diagnostics/duplicated"
                                                               :query prefix))))]
              (testing "superuser sees the peer"
                (is (= [secret-card] (mapv :id (get-in (finding :crowberto) [:details :duplicate_entities])))))
              (testing "non-admin gets an empty peer list while duplicate_count still reports 1"
                (let [f (finding :rasta)]
                  (is (= [] (get-in f [:details :duplicate_entities])))
                  (is (= 1 (:duplicate_count f))))))))))))

(deftest duplicated-api-personal-peers-follow-param-test
  (testing "GET /duplicated peer hydration honors include-personal-collections like the findings filter"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
            (mt/with-temp [:model/Collection {reg-id :id}     {}
                           :model/Card       {flagged :id}    {:collection_id reg-id}
                           :model/Card       {reg-peer :id}   {:collection_id reg-id}
                           :model/Card       {pers-peer :id}  {:collection_id pers-id}]
              (perms/grant-collection-read-permissions! (perms/all-users-group) reg-id)
              (let [prefix   (scope-prefix)
                    fid      (first (t2/insert-returning-pks!
                                     :model/ContentDiagnosticsFinding
                                     {:scan_id "pc" :entity_type :card :entity_id flagged
                                      :entity_name (str prefix "-card")
                                      :finding_type :duplicated :duplicate_count 2
                                      :details {:normalized_name      "x"
                                                :duplicate_entity_ids [reg-peer pers-peer]}}))
                    peer-ids (fn [& kvs]
                               (let [finding (some #(when (= fid (:id %)) %)
                                                   (:data (apply mt/user-http-request
                                                                 :rasta :get 200
                                                                 "ee/content-diagnostics/duplicated"
                                                                 :query prefix kvs)))]
                                 (into #{} (map :id) (get-in finding [:details :duplicate_entities]))))]
                (testing "default → the caller's own (readable) personal-collection peer is hidden too"
                  (is (= #{reg-peer} (peer-ids))))
                (testing "include-personal-collections=true → both peers hydrate"
                  (is (= #{reg-peer pers-peer} (peer-ids :include-personal-collections true))))))))))))

(deftest duplicated-api-transform-peers-hydrate-test
  (testing "GET /duplicated gates transform peers on transform readability, not collection visibility"
    ;; Enable transforms via premium features, not the `transforms-enabled` setting: with no `:hosting`
    ;; in scope, `with-temporary-setting-values` would restore an explicit global `false` that disables
    ;; transforms for every other test in a parallel run.
    (mt/with-premium-features #{:content-diagnostics :transforms-basic :hosting}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Nightly Sync")]
          (mt/with-temp [:model/Transform {xf-a :id} {:name nm}
                         :model/Transform {xf-b :id} {:name nm}]
            (scan/scan!)
            (let [finding (fn [user]
                            (some #(when (= [xf-a "transform"] [(:entity_id %) (:entity_type %)]) %)
                                  (:data (mt/user-http-request user :get 200
                                                               "ee/content-diagnostics/duplicated"
                                                               :query prefix))))]
              (testing "superuser: the peer hydrates from the transform model - no card_type, no view_count"
                (is (= [{:id xf-b :name nm :entity_type "transform"}]
                       (get-in (finding :crowberto) [:details :duplicate_entities]))))
              (testing "a non-data-analyst sees the finding (collection-visible) but not the peer"
                (let [f (finding :rasta)]
                  (is (some? f))
                  (is (= [] (get-in f [:details :duplicate_entities]))))))))))))

(deftest duplicated-api-does-not-leak-across-finding-types-test
  (testing "a duplicated finding never surfaces in /stale or /slow, and theirs never surface in /duplicated"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {stale-card :id} {:collection_id coll-id}
                         :model/Card {slow-card :id}  {:collection_id coll-id}
                         :model/Card {dup-card :id}   {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix    (scope-prefix)
                  stale-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id stale-card
                                                              :entity_name (str prefix "-stale")
                                                              :finding_type :stale :details {:threshold_days 90}}))
                  slow-fid  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id slow-card
                                                              :entity_name (str prefix "-slow")
                                                              :finding_type :slow :duration_ms 20000
                                                              :details {:threshold_ms 15000}}))
                  dup-fid   (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id dup-card
                                                              :entity_name (str prefix "-dup")
                                                              :finding_type :duplicated :duplicate_count 1
                                                              :details {:normalized_name      "x"
                                                                        :duplicate_entity_ids []}}))
                  ids (fn [path] (set (map :id (:data (mt/user-http-request :rasta :get 200 path :query prefix)))))]
              (testing "/duplicated returns only the duplicated finding"
                (is (= #{dup-fid} (ids "ee/content-diagnostics/duplicated"))))
              (testing "/slow and /stale each exclude the duplicated finding"
                (is (= #{slow-fid} (ids "ee/content-diagnostics/slow")))
                (is (= #{stale-fid} (ids "ee/content-diagnostics/stale")))))))))))

(deftest duplicated-api-feature-gated-test
  (testing "GET /duplicated is gated on the :content-diagnostics premium feature"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "licensed → 200 with the paginated envelope"
        (mt/with-premium-features #{:content-diagnostics}
          (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/duplicated")]
            (is (contains? resp :data))
            (is (contains? resp :total)))))
      (testing "unlicensed → 402"
        (mt/with-premium-features #{}
          (mt/user-http-request :rasta :get 402 "ee/content-diagnostics/duplicated"))))))

;;; ------------------------------------------- collection subject ----------------------------------------

(deftest duplicated-checker-flags-collection-name-clusters-test
  (testing "same-named eligible collections cluster instance-wide; archived / non-default-namespace ones sit out"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [prefix (scope-prefix)
              nm     (str prefix " Reports")]
          (mt/with-temp [:model/Collection {coll-a :id}   {:name nm}
                         :model/Collection {coll-b :id}   {:name nm}
                         :model/Collection {solo :id}     {:name (str prefix " Unique")}
                         :model/Collection {archived :id} {:name nm :archived true}
                         :model/Collection {snippet :id}  {:name nm :namespace "snippets"}]
            (let [by-entity (duplicated-findings-by-entity!)]
              (testing "the two eligible same-named collections are symmetric peers, duplicate_count 1"
                (is (= 1 (:duplicate_count (by-entity [:collection coll-a]))))
                (is (= [coll-b] (get-in (by-entity [:collection coll-a]) [:details :duplicate_entity_ids])))
                (is (= [coll-a] (get-in (by-entity [:collection coll-b]) [:details :duplicate_entity_ids]))))
              (testing "a uniquely-named collection and the ineligible (archived / snippet-namespace) ones get no finding"
                (is (nil? (by-entity [:collection solo])))
                (is (nil? (by-entity [:collection archived])))
                (is (nil? (by-entity [:collection snippet]))))
              (testing "the ineligible collections do not count as peers either"
                (is (= [coll-b] (get-in (by-entity [:collection coll-a]) [:details :duplicate_entity_ids])))))))))))

(deftest duplicated-api-collection-peers-hydrate-test
  (testing "GET /duplicated hydrates collection peers gated on the collection's own read visibility (its own :id)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [prefix (scope-prefix)
                nm     (str prefix " Shared")]
            (mt/with-temp [:model/Collection {parent :id} {:name (str prefix " Parent")}
                           :model/Collection {coll-a :id} {:name        nm
                                                           :description "the A one"
                                                           :location    (str "/" parent "/")}
                           :model/Collection {coll-b :id} {:name nm}]
              ;; the caller can read the flagged collection but NOT its peer
              (perms/grant-collection-read-permissions! (perms/all-users-group) coll-a)
              (scan/scan!)
              (let [finding (fn [user]
                              (some #(when (= [coll-a "collection"] [(:entity_id %) (:entity_type %)]) %)
                                    (:data (mt/user-http-request user :get 200
                                                                 "ee/content-diagnostics/duplicated"
                                                                 :query prefix :entity-types "collection"))))]
                (testing "superuser: the peer hydrates as a bare collection object - no card_type, no view_count"
                  (let [f (finding :crowberto)]
                    (is (some? f))
                    (is (= [{:id coll-b :name nm :entity_type "collection"}]
                           (get-in f [:details :duplicate_entities])))
                    (testing "context: the breadcrumb anchor is the parent (where it lives), plus description; no owner/creator"
                      (is (= parent (get-in f [:details :collection :id])))
                      (is (= "the A one" (get-in f [:details :description])))
                      (is (nil? (get-in f [:details :owner])))
                      (is (nil? (get-in f [:details :creator]))))))
                (testing "non-admin who can read the flagged collection but not the peer: finding shows, peer drops out"
                  (let [f (finding :rasta)]
                    (is (some? f))
                    (is (= [] (get-in f [:details :duplicate_entities])))
                    (is (= 1 (:duplicate_count f)))))))))))))
