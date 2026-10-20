(ns metabase-enterprise.data-sensitivity.api.apply-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.review :as review]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- url [run-id & parts]
  (apply str "ee/data-sensitivity/runs/" run-id parts))

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

(defn- apply! [run-id body]
  (mt/user-http-request :crowberto :post 200 (url run-id "/apply") body))

(def ^:private nothing {:written 0 :rejected 0 :stale 0 :failed 0 :failures []})

(defn- do-with-run
  "Tables `A` and `B` of one database with a run over them. `f` gets the run id and a map of table and field ids: text
  fields `a-text` (deterministic `type/Category`), `a-plain` (no semantic type) and `b-text` (deterministic
  `type/Category`), integer field `a-int` (no semantic type) and `a-fk` (`type/FK`)."
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
    (f run-id {:a a :b b :a-text a-text :a-plain a-plain :a-int a-int :a-fk a-fk :b-text b-text})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id _]
       (mt/user-http-request :rasta :post 403 (url run-id "/apply") {})
       (mt/user-http-request :crowberto :post 404 (url Integer/MAX_VALUE "/apply") {})))))

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
                (apply! run-id {:accept [sem ds desc]})))
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
           (is (= nothing (apply! run-id {:accept [sem]})))))))))

(deftest apply-accepts-rejects-and-edits-in-one-request-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a b a-text a-plain a-int b-text]}]
       (let [sem      (suggestion! run-id a a-text)
             ds       (suggestion! run-id a a-plain :attribute :data_sensitivity
                                   :proposed_value "PII")
             edited   (suggestion! run-id a a-int :proposed_value "type/Quantity")
             rejected (suggestion! run-id b b-text)
             left     (suggestion! run-id a a-plain :attribute :description
                                   :proposed_value "Left alone.")]
         (is (= (assoc nothing :written 3 :rejected 1)
                (apply! run-id {:accept [sem ds] :reject [rejected] :edits {edited "type/Score"}})))
         (is (= {sem :deleted ds :deleted edited :deleted rejected :rejected left :pending}
                (statuses [sem ds edited rejected left])))
         (testing "the edit is written as the person's value, the others as AI values"
           (is (=? {:semantic_type :type/Score :semantic_type_set true :ai_semantic_type nil} (settings a-int)))
           (is (=? {:ai_semantic_type :type/Email} (settings a-text)))
           (is (=? {:ai_data_sensitivity :PII :ai_description nil} (settings a-plain))))
         (testing "a rejection writes nothing and records who decided it"
           (is (nil? (settings b-text)))
           (is (=? {:decided_by (mt/user->id :crowberto) :decided_at some?}
                   (t2/select-one :model/MetadataGenerationProposal rejected))))
         (testing "a rejected proposal can be accepted by a later apply"
           (is (= (assoc nothing :written 1) (apply! run-id {:accept [rejected]})))
           (is (= :deleted (get (statuses [rejected]) rejected)))))))))

(deftest apply-all-test
  (mt/with-premium-features #{:data-sensitivity}
    (testing "all accepts every proposal of the run except those in except or reject, and leaves out human-set ones"
      (do-with-run
       (fn [run-id {:keys [a b a-text a-plain a-int b-text]}]
         (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
         (let [human    (suggestion! run-id a a-text)
               ds       (suggestion! run-id a a-plain :attribute :data_sensitivity
                                     :proposed_value "PII")
               excepted (suggestion! run-id a a-int :proposed_value "type/Quantity")
               rejected (suggestion! run-id a a-plain :attribute :description
                                     :proposed_value "No.")
               other    (suggestion! run-id b b-text)]
           (is (= (assoc nothing :written 2 :rejected 1)
                  (apply! run-id {:all true :except [excepted] :reject [rejected]})))
           (is (= {human :pending ds :deleted excepted :pending rejected :rejected other :deleted}
                  (statuses [human ds excepted rejected other])))
           (is (=? {:semantic_type :type/Name :semantic_type_set true} (settings a-text))))))
      (testing "include_human_set accepts human-set proposals too, and table_ids limits the scope"
        (do-with-run
         (fn [run-id {:keys [a b a-text b-text]}]
           (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
           (let [human (suggestion! run-id a a-text)
                 other (suggestion! run-id b b-text)]
             (is (= (assoc nothing :written 1)
                    (apply! run-id {:all true :table_ids [a] :include_human_set true})))
             (is (= {human :deleted other :pending} (statuses [human other])))
             (is (=? {:semantic_type nil :semantic_type_set false :ai_semantic_type :type/Email}
                     (settings a-text)))))))
      (testing "an edit accepts a human-set proposal under all"
        (do-with-run
         (fn [run-id {:keys [a a-text]}]
           (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
           (let [human (suggestion! run-id a a-text)]
             (is (= (assoc nothing :written 1) (apply! run-id {:all true :edits {human "type/Title"}})))
             (is (=? {:semantic_type :type/Title :semantic_type_set true} (settings a-text))))))))))

(deftest apply-request-validation-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-int]}]
       (let [sem (suggestion! run-id a a-int :proposed_value "type/Quantity")
             ds  (suggestion! run-id a a-plain :attribute :data_sensitivity
                              :proposed_value "PII")]
         (testing "the selection must be consistent"
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply") {:accept [sem] :all true})
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply") {:accept [sem] :except [ds]})
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply") {:table_ids [a]})
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply") {:accept [sem] :reject [sem]})
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply") {:reject [sem] :edits {sem "type/Score"}})
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply")
                                 {:all true :except [sem] :edits {sem "type/Score"}}))
         (testing "a refused edit is a 400 and writes nothing"
           (mt/user-http-request :crowberto :post 400 (url run-id "/apply")
                                 {:accept [ds] :edits {sem "type/Email"}})
           (is (= {sem :pending ds :pending} (statuses [sem ds])))
           (is (nil? (settings a-plain))))
         (testing "ids of another run are ignored"
           (mt/with-temp [:model/MetadataGenerationRun {other-run :id} {:database_id (t2/select-one-fn :db_id :model/Table a)
                                                                        :scope       {:type :database}
                                                                        :attributes  [:semantic_type]
                                                                        :status      :succeeded
                                                                        :is_active   nil}]
             (is (= nothing (apply! other-run {:accept [sem] :reject [ds]})))
             (is (= {sem :pending ds :pending} (statuses [sem ds]))))))))))

(deftest apply-reads-human-layer-at-accept-time-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain]}]
       (let [sem (suggestion! run-id a a-text)
             ds  (suggestion! run-id a a-plain :attribute :data_sensitivity :proposed_value "PII")]
         (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
         (t2/insert! :model/FieldUserSettings {:field_id a-plain :ai_data_sensitivity :PHI})
         (testing "all leaves out a proposal over a value a person set after the run"
           (is (= (assoc nothing :written 1) (apply! run-id {:all true})))
           (is (= {sem :pending ds :deleted} (statuses [sem ds])))
           (is (=? {:semantic_type :type/Name} (effective a-text)))
           (is (=? {:data_sensitivity :PII} (effective a-plain))))
         (testing "accept by id replaces the person's value"
           (is (= (assoc nothing :written 1) (apply! run-id {:accept [sem]})))
           (is (=? {:semantic_type nil :semantic_type_set false :ai_semantic_type :type/Email} (settings a-text)))))))))

(deftest apply-over-human-value-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain]}]
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-plain) {:description nil})
       (let [sem  (suggestion! run-id a a-text)
             desc (suggestion! run-id a a-plain :attribute :description
                               :proposed_value "A plain text field.")]
         (is (=? {:written 2} (apply! run-id {:accept [sem desc]})))
         (is (= {sem :deleted desc :deleted} (statuses [sem desc])))
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
       (suggestion! run-id a a-plain :proposed_value "type/Category")
       (is (=? {:written 1} (apply! run-id {:all true})))
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
         (is (= {:written 0 :rejected 0 :stale 0 :failed 3
                 :failures [{:suggestion_id key-field :field_id a-fk :attribute "semantic_type" :reason "key_field"}
                            {:suggestion_id misfit :field_id a-int :attribute "semantic_type" :reason "type_mismatch"}
                            {:suggestion_id missing :field_id a-plain :attribute "description"
                             :reason "field_not_found"}]}
                (apply! run-id {:accept [key-field misfit missing]})))
         (testing "failed proposals stay pending and write nothing"
           (is (= #{:pending} (set (vals (statuses [key-field misfit missing])))))
           (is (nil? (settings a-fk)))))))))

(deftest apply-side-effects-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-int]}]
       (mt/with-temp [:model/Dimension {dim :id} {:field_id a-int :type :internal :name "Remapped"}]
         (suggestion! run-id a a-int :proposed_value "type/Quantity")
         (suggestion! run-id a a-int :attribute :data_sensitivity
                      :proposed_value "BIZ_CONF")
         (suggestion! run-id a a-text)
         (let [published (atom [])]
           (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
             (mt/with-current-user (mt/user->id :crowberto)
               (is (=? {:written 3} (review/apply! run-id {:all true} (mt/user->id :crowberto))))))
           (testing "one :event/field-update per written field, with the value readers see"
             (is (= #{[:event/field-update a-int] [:event/field-update a-text]}
                    (set (map (fn [[topic {:keys [object]}]] [topic (:id object)]) @published))))
             (is (= 2 (count @published)))
             (is (=? {:semantic_type :type/Quantity}
                     (some (fn [[_ {:keys [object]}]] (when (= a-int (:id object)) object)) @published)))))
         (testing "an internal remapping the new semantic type does not allow is removed"
           (is (not (t2/exists? :model/Dimension :id dim)))))))))

(deftest value-source-test
  (testing "the layer readers see, in the order of field-query"
    (is (= :none (context/value-source nil :semantic_type nil)))
    (is (= :deterministic (context/value-source nil :semantic_type :type/Category)))
    (is (= :ai (context/value-source {:ai_semantic_type :type/Email} :semantic_type :type/Email)))
    (is (= :human (context/value-source {:semantic_type_set true :ai_semantic_type :type/Email} :semantic_type nil)))
    (is (= :human (context/value-source {:display_name "X"} :display_name "X")))))

(defn- apply-edit! [run-id suggestion-id status value]
  (mt/user-http-request :crowberto :post status (url run-id "/apply") {:edits {suggestion-id value}}))

(deftest edit-validation-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-int]}]
       (let [sem  (suggestion! run-id a a-int :proposed_value "type/Quantity")
             ds   (suggestion! run-id a a-plain :attribute :data_sensitivity
                               :proposed_value "PII")
             desc (suggestion! run-id a a-plain :attribute :description
                               :proposed_value "A field.")]
         (testing "only a superuser can apply"
           (mt/user-http-request :rasta :post 403 (url run-id "/apply") {:edits {sem "type/Score"}}))
         (testing "a semantic type must be known, not a key type, and fit the field"
           (apply-edit! run-id sem 400 "type/Nonsense")
           (apply-edit! run-id sem 400 "type/PK")
           (apply-edit! run-id sem 400 "type/FK")
           (apply-edit! run-id sem 400 "type/Email"))
         (testing "a data sensitivity must be a category"
           (apply-edit! run-id ds 400 "SECRET"))
         (testing "a description must be non-blank and at most the cap"
           (apply-edit! run-id desc 400 "   ")
           (apply-edit! run-id desc 400 (apply str (repeat 201 "x"))))
         (testing "a refused value leaves the proposal as it was"
           (is (= {sem :pending ds :pending desc :pending} (statuses [sem ds desc]))))
         (testing "a valid value is normalized and written"
           (is (=? {:written 1} (apply-edit! run-id desc 200 "  A counter.  ")))
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
                (apply! run-id {:accept [sem]
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
           (is (= :human (context/value-source (settings a-plain) :data_sensitivity :BIZ_CONF)))
           (is (= :human (context/value-source (settings a-int) :semantic_type :type/Score)))))))))
