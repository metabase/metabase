(ns metabase-enterprise.data-sensitivity.api.apply-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.review :as review]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private url "ee/data-sensitivity/proposals/apply")

(defn- suggestion! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-pk! :model/MetadataGenerationProposal
                           (merge {:last_run_id    run-id
                                   :table_id       table-id
                                   :field_id       field-id
                                   :attribute      :semantic_type
                                   :proposed_value "type/Email"}
                                  overrides)))

(defn- statuses
  "A map of proposal id to its status, or `:deleted` when the row is gone."
  [ids]
  (into (zipmap ids (repeat :deleted))
        (map (juxt :id :status))
        (t2/select :model/MetadataGenerationProposal :id [:in ids])))

(defn- effective [field-id]
  (t2/select-one :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query)]}))

(defn- settings [field-id]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(defn- apply! [body]
  (mt/user-http-request :crowberto :post 200 url body))

(def ^:private nothing {:written 0 :rejected 0 :failed 0 :failures []})

(defn- do-with-run
  "Tables `A` and `B` of one database with a run over them. `f` gets the run id and a map of table and field ids: text
  fields `a-text` (deterministic `type/Category`), `a-plain` (no semantic type) and `b-text` (deterministic
  `type/Category`), integer field `a-int` (no semantic type) and `a-fk` (`type/FK`), and the database id `db`."
  [f]
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {a :id}      {:db_id db-id :schema "S" :name "A"}
                 :model/Table    {b :id}      {:db_id db-id :schema "S" :name "B"}
                 :model/Field    {a-text :id} {:table_id a :name "a_text" :base_type :type/Text
                                               :semantic_type :type/Category}
                 :model/Field    {a-plain :id} {:table_id a :name "a_plain" :base_type :type/Text}
                 :model/Field    {a-int :id}  {:table_id a :name "a_int" :base_type :type/Integer}
                 :model/Field    {a-fk :id}   {:table_id a :name "a_fk" :base_type :type/Integer
                                               :semantic_type :type/FK}
                 :model/Field    {b-text :id} {:table_id b :name "b_text" :base_type :type/Text
                                               :semantic_type :type/Category}
                 :model/MetadataGenerationRun {run-id :id} {:database_id db-id
                                                            :scope       {:type :database}
                                                            :attributes  [:data_sensitivity :semantic_type :description]
                                                            :status      :succeeded}]
    (f run-id {:db db-id :a a :b b :a-text a-text :a-plain a-plain :a-int a-int :a-fk a-fk :b-text b-text})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (mt/user-http-request :rasta :post 403 url {})))

(deftest apply-writes-accepted-ai-values-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a b a-text a-plain b-text]}]
       (let [sem     (suggestion! run-id a a-text)
             ds      (suggestion! run-id a a-plain :attribute :data_sensitivity
                                  :proposed_value "PII")
             desc    (suggestion! run-id a a-plain :attribute :description
                                  :proposed_value "The customer's email address.")
             pending (suggestion! run-id a a-plain)
             other   (suggestion! run-id b b-text)]
         (is (= (assoc nothing :written 3)
                (apply! {:accept [sem ds desc]})))
         (testing "only the accepted proposals are written, and their rows are deleted"
           (is (= {sem :deleted ds :deleted desc :deleted pending :pending other :pending}
                  (statuses [sem ds desc pending other]))))
         (testing "the values land in the AI columns and readers see them"
           (is (=? {:ai_semantic_type :type/Email :semantic_type nil :semantic_type_set false}
                   (settings a-text)))
           (is (=? {:ai_data_sensitivity :PII :ai_description "The customer's email address."
                    :data_sensitivity nil :description nil}
                   (settings a-plain)))
           (is (=? {:semantic_type :type/Email} (effective a-text)))
           (is (=? {:data_sensitivity :PII :description "The customer's email address."} (effective a-plain))))
         (testing "the deterministic layer does not change"
           (is (= :type/Category (t2/select-one-fn :semantic_type :model/Field :id a-text))))
         (testing "an accepted proposal is not written again"
           (is (= nothing (apply! {:accept [sem]})))))))))

(deftest apply-accepts-and-edits-in-one-request-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain a-int]}]
       (let [sem    (suggestion! run-id a a-text)
             ds     (suggestion! run-id a a-plain :attribute :data_sensitivity
                                 :proposed_value "PII")
             edited (suggestion! run-id a a-int :proposed_value "type/Quantity")
             left   (suggestion! run-id a a-plain :attribute :description
                                 :proposed_value "Left alone.")]
         (is (= (assoc nothing :written 3)
                (apply! {:accept [sem ds] :edits {edited "type/Score"}})))
         (is (= {sem :deleted ds :deleted edited :deleted left :pending}
                (statuses [sem ds edited left])))
         (testing "the accepted proposals are written as AI values"
           (is (=? {:ai_semantic_type :type/Email} (settings a-text)))
           (is (=? {:ai_data_sensitivity :PII :ai_description nil} (settings a-plain)))))))))

(deftest reject-all-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [db a b a-text a-plain a-int b-text]}]
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
       (mt/with-temp [:model/Database {other-db :id} {}
                      :model/Table    {other-t :id}  {:db_id other-db :name "O"}
                      :model/Field    {other-f :id}  {:table_id other-t :name "o" :base_type :type/Text}]
         (let [human    (suggestion! run-id a a-text)
               ds       (suggestion! run-id a a-plain :attribute :data_sensitivity :proposed_value "PII")
               inactive (suggestion! run-id a a-int :proposed_value "type/Quantity")
               b-sem    (suggestion! run-id b b-text)
               other    (suggestion! run-id other-t other-f)]
           (t2/update! :model/Field a-int {:active false})
           (is (= (assoc nothing :rejected 3)
                  (apply! {:reject_all true :database_id db})))
           (testing "every pending proposal of active fields of the database is rejected, human-set ones too"
             (is (= {human :rejected ds :rejected b-sem :rejected inactive :pending other :pending}
                    (statuses [human ds b-sem inactive other]))))
           (testing "a rejection writes nothing and records who decided it"
             (is (=? {:semantic_type :type/Name :ai_semantic_type nil} (settings a-text)))
             (is (nil? (settings a-plain)))
             (is (=? {:decided_by (mt/user->id :crowberto) :decided_at some?}
                     (t2/select-one :model/MetadataGenerationProposal ds))))
           (testing "rejected proposals are hidden from the review"
             (is (= [] (mt/user-http-request :crowberto :get 200 "ee/data-sensitivity/proposals/tables"
                                             :database-id db))))
           (testing "a second reject_all rejects nothing"
             (is (= nothing (apply! {:reject_all true :database_id db}))))))))))

(deftest apply-request-validation-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [db a a-plain a-int]}]
       (let [sem (suggestion! run-id a a-int :proposed_value "type/Quantity")
             ds  (suggestion! run-id a a-plain :attribute :data_sensitivity
                              :proposed_value "PII")]
         (testing "the request must be consistent"
           (mt/user-http-request :crowberto :post 400 url {:reject_all true})
           (mt/user-http-request :crowberto :post 400 url {:database_id db})
           (mt/user-http-request :crowberto :post 400 url {:reject_all true :database_id db :accept [sem]})
           (mt/user-http-request :crowberto :post 400 url
                                 {:reject_all true :database_id db :edits {sem "type/Score"}})
           (is (= {sem :pending ds :pending} (statuses [sem ds]))))
         (testing "a refused edit is a 400 and writes nothing"
           (mt/user-http-request :crowberto :post 400 url
                                 {:accept [ds] :edits {sem "type/Email"}})
           (is (= {sem :pending ds :pending} (statuses [sem ds])))
           (is (nil? (settings a-plain))))
         (testing "ids that name no proposal are ignored"
           (is (= nothing (apply! {:accept [Integer/MAX_VALUE] :edits {(dec Integer/MAX_VALUE) "type/Score"}})))
           (is (= {sem :pending ds :pending} (statuses [sem ds])))))))))

(deftest apply-skips-changed-proposals-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain a-int]}]
       (let [replaced (suggestion! run-id a a-text :proposed_value "type/Name")
             same     (suggestion! run-id a a-plain :attribute :data_sensitivity :proposed_value "PII")
             edited   (suggestion! run-id a a-int :proposed_value "type/Score")
             gone     (suggestion! run-id a a-plain)]
         (t2/delete! :model/MetadataGenerationProposal gone)
         (is (= {:written  1
                 :rejected 0
                 :failed   3
                 :failures [{:proposal_id replaced :field_id a-text :attribute "semantic_type" :reason "changed"}
                            {:proposal_id edited :field_id a-int :attribute "semantic_type" :reason "changed"}
                            {:proposal_id gone :field_id nil :attribute nil :reason "changed"}]}
                (apply! {:accept          [replaced same gone]
                         :edits           {edited "type/Quantity"}
                         :proposed_values {replaced "type/Email"
                                           same     "PII"
                                           edited   "type/Quantity"
                                           gone     "type/Email"}})))
         (testing "a changed proposal is not written"
           (is (= {replaced :pending same :deleted edited :pending}
                  (statuses [replaced same edited])))
           (is (nil? (settings a-text)))
           (is (nil? (settings a-int))))
         (testing "a proposal without a seen value is written"
           (is (=? {:written 1 :failed 0} (apply! {:accept [replaced]})))
           (is (=? {:ai_semantic_type :type/Name} (settings a-text)))))))))

(deftest apply-over-human-value-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain a-int]}]
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-plain) {:description nil})
       (t2/insert! :model/FieldUserSettings {:field_id a-int :ai_data_sensitivity :PHI})
       (let [sem  (suggestion! run-id a a-text)
             desc (suggestion! run-id a a-plain :attribute :description
                               :proposed_value "A plain text field.")
             ds   (suggestion! run-id a a-int :attribute :data_sensitivity :proposed_value "PII")]
         (is (=? {:written 3} (apply! {:accept [sem desc ds]})))
         (is (= {sem :deleted desc :deleted ds :deleted} (statuses [sem desc ds])))
         (testing "an accepted proposal replaces an earlier AI value"
           (is (=? {:data_sensitivity :PII} (effective a-int))))
         (testing "the person's value is cleared and readers see the AI value"
           (is (=? {:semantic_type nil :semantic_type_set false :ai_semantic_type :type/Email} (settings a-text)))
           (is (=? {:description nil :description_set false :ai_description "A plain text field."}
                   (settings a-plain)))
           (is (=? {:semantic_type :type/Email} (effective a-text)))
           (is (=? {:description "A plain text field."} (effective a-plain)))))))))

(deftest apply-category-leaves-has-field-values-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain]}]
       (let [sem (suggestion! run-id a a-plain :proposed_value "type/Category")]
         (is (=? {:written 1} (apply! {:accept [sem]}))))
       (is (=? {:semantic_type :type/Category :has_field_values nil} (effective a-plain)))
       (is (nil? (t2/select-one-fn :has_field_values :model/Field :id a-plain)))))))

(deftest apply-failures-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-int a-fk]}]
       (let [key-field (suggestion! run-id a a-fk :proposed_value "type/Category")
             misfit    (suggestion! run-id a a-int :proposed_value "type/Email")
             missing   (suggestion! run-id a a-plain :attribute :description
                                    :proposed_value "Gone.")]
         (t2/update! :model/Field a-plain {:active false})
         (is (= {:written 0 :rejected 0 :failed 3
                 :failures [{:proposal_id key-field :field_id a-fk :attribute "semantic_type" :reason "key_field"}
                            {:proposal_id misfit :field_id a-int :attribute "semantic_type" :reason "type_mismatch"}
                            {:proposal_id missing :field_id a-plain :attribute "description"
                             :reason "field_not_found"}]}
                (apply! {:accept [key-field misfit missing]})))
         (testing "failed proposals stay pending and write nothing"
           (is (= #{:pending} (set (vals (statuses [key-field misfit missing])))))
           (is (nil? (settings a-fk)))))))))

(deftest apply-skips-fields-of-inactive-tables-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [b b-text]}]
       (let [desc (suggestion! run-id b b-text :attribute :description :proposed_value "Hidden.")]
         (t2/update! :model/Table b {:active false})
         (is (= {:written 0 :rejected 0 :failed 1
                 :failures [{:proposal_id desc :field_id b-text :attribute "description" :reason "field_not_found"}]}
                (apply! {:accept [desc]})))
         (testing "a field of an inactive table gets no AI value and its proposal stays pending"
           (is (nil? (:ai_description (settings b-text))))
           (is (= {desc :pending} (statuses [desc])))))))))

(deftest apply-does-not-accept-rejected-proposals-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-fk]}]
       (let [desc (suggestion! run-id a a-plain :attribute :description :proposed_value "AI text"
                               :status :rejected :decided_by (mt/user->id :crowberto))
             key  (suggestion! run-id a a-fk :proposed_value "type/Category"
                               :status :rejected :decided_by (mt/user->id :crowberto))]
         (testing "a rejected proposal accepted by id is not written and is listed as changed"
           (is (=? {:written 0 :failed 1 :failures [{:proposal_id desc :reason "changed"}]}
                   (apply! {:accept [desc] :proposed_values {desc "AI text"}})))
           (is (nil? (settings a-plain)))
           (is (= {desc :rejected} (statuses [desc]))))
         (testing "a rejected proposal accepted by id stays rejected when it cannot be written"
           (is (=? {:written 0} (apply! {:accept [key]})))
           (is (= {key :rejected} (statuses [key])))))))))

(deftest apply-counts-written-proposals-when-an-event-handler-fails-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain]}]
       (let [desc (suggestion! run-id a a-plain :attribute :description :proposed_value "AI text")]
         (with-redefs [events/publish-event! (fn [& _] (throw (ex-info "handler failed" {})))]
           (testing "a proposal whose table transaction committed counts as written"
             (is (= (assoc nothing :written 1)
                    (apply! {:accept [desc]})))))
         (is (= {desc :deleted} (statuses [desc])))
         (is (=? {:ai_description "AI text"} (settings a-plain))))))))

(deftest apply-keeps-a-proposal-a-run-changes-during-apply-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain]}]
       (let [desc   (suggestion! run-id a a-plain :attribute :description :proposed_value "v1")
             orig   db/active-fields-by-id
             upsert (promise)]
         (mt/with-dynamic-fn-redefs [db/active-fields-by-id (fn [ids]
                                                              (when-not (realized? upsert)
                                                                (deliver upsert
                                                                         (future
                                                                           (t2/update! :model/MetadataGenerationProposal desc
                                                                                       {:proposed_value "v2" :status :pending})))
                                                                (deref @upsert 2000 nil))
                                                              (orig ids))]
           (apply! {:accept [desc] :proposed_values {desc "v1"}}))
         @@upsert
         (testing "a value a run upserts after the staleness check is not lost"
           (is (=? {:proposed_value "v2" :status :pending}
                   (t2/select-one :model/MetadataGenerationProposal :id desc)))
           (is (nil? (:ai_description (settings a-plain))))))))))

(deftest apply-side-effects-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-int]}]
       (mt/with-temp [:model/Dimension {dim :id} {:field_id a-int :type :internal :name "Remapped"}]
         (let [ids       [(suggestion! run-id a a-int :proposed_value "type/Quantity")
                          (suggestion! run-id a a-int :attribute :data_sensitivity
                                       :proposed_value "BIZ_CONF")
                          (suggestion! run-id a a-text)]
               published (atom [])]
           (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
             (mt/with-current-user (mt/user->id :crowberto)
               (is (=? {:written 3} (review/apply! {:accept ids} (mt/user->id :crowberto))))))
           (testing "one :event/field-update per written field, with the value readers see"
             (is (= #{[:event/field-update a-int] [:event/field-update a-text]}
                    (set (map (fn [[topic {:keys [object]}]] [topic (:id object)]) @published))))
             (is (= 2 (count @published)))
             (is (=? {:semantic_type :type/Quantity}
                     (some (fn [[_ {:keys [object]}]] (when (= a-int (:id object)) object)) @published)))))
         (testing "an internal remapping the new semantic type does not allow is removed"
           (is (not (t2/exists? :model/Dimension :id dim)))))))))

(defn- apply-edit! [suggestion-id status value]
  (mt/user-http-request :crowberto :post status url {:edits {suggestion-id value}}))

(deftest edit-validation-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-int]}]
       (let [sem  (suggestion! run-id a a-int :proposed_value "type/Quantity")
             ds   (suggestion! run-id a a-plain :attribute :data_sensitivity
                               :proposed_value "PII")
             desc (suggestion! run-id a a-plain :attribute :description
                               :proposed_value "A field.")]
         (testing "a semantic type must be known, not a key type, and fit the field"
           (apply-edit! sem 400 "type/Nonsense")
           (apply-edit! sem 400 "type/PK")
           (apply-edit! sem 400 "type/FK")
           (apply-edit! sem 400 "type/Email"))
         (testing "a data sensitivity must be a category"
           (apply-edit! ds 400 "SECRET"))
         (testing "a description must be non-blank and at most the cap"
           (apply-edit! desc 400 "   ")
           (apply-edit! desc 400 (apply str (repeat 201 "x"))))
         (testing "a description must not hold a Markdown link, an HTML tag or a code span"
           (apply-edit! desc 400 "A field. [Verify account](//evil.example/login)")
           (apply-edit! desc 400 "A field. <a href=\"/login\">Verify</a>")
           (apply-edit! desc 400 "A field. Run `DROP TABLE users`."))
         (testing "a refused value leaves the proposal as it was"
           (is (= {sem :pending ds :pending desc :pending} (statuses [sem ds desc]))))
         (testing "a valid value is normalized and written"
           (is (=? {:written 1} (apply-edit! desc 200 "  A counter.  ")))
           (is (=? {:description "A counter." :description_set true} (settings a-plain)))))))))

(deftest edited-value-applies-as-human-value-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain a-int]}]
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
       (let [sem   (suggestion! run-id a a-int :proposed_value "type/Quantity")
             ds    (suggestion! run-id a a-plain :attribute :data_sensitivity
                                :proposed_value "PII" :status :rejected)
             desc  (suggestion! run-id a a-plain :attribute :description
                                :proposed_value "A field.")
             human (suggestion! run-id a a-text
                                :proposed_value "type/Category")]
         (is (= (assoc nothing :written 4)
                (apply! {:accept [sem]
                         :edits  {sem   "type/Score"
                                  ds    "BIZ_CONF"
                                  desc  "The plain text."
                                  human "type/Title"}})))
         (is (= {sem :deleted ds :deleted desc :deleted human :deleted} (statuses [sem ds desc human])))
         (testing "edited values land in the human layer with their set flags, not in the AI columns"
           (is (=? {:semantic_type :type/Score :semantic_type_set true :ai_semantic_type nil} (settings a-int)))
           (is (=? {:data_sensitivity :BIZ_CONF :data_sensitivity_set true :ai_data_sensitivity nil
                    :description "The plain text." :description_set true :ai_description nil}
                   (settings a-plain)))
           (is (=? {:semantic_type :type/Title :semantic_type_set true :ai_semantic_type nil} (settings a-text))))
         (testing "readers see the edited values as set by a person"
           (is (=? {:semantic_type :type/Score} (effective a-int)))
           (is (=? {:data_sensitivity :BIZ_CONF :description "The plain text."} (effective a-plain)))
           (is (=? {:semantic_type :type/Title} (effective a-text)))
           (is (warehouse-schema-overlay/field-user-set? (settings a-plain) :data_sensitivity))
           (is (warehouse-schema-overlay/field-user-set? (settings a-int) :semantic_type))))))))
