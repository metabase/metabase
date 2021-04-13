(ns metabase.test.generate
  (:require [clojure.spec.alpha :as s]
            [clojure.test.check.generators :as gen]
            [clojure.tools.reader.edn :as edn]
            [java-time :as t]
            [metabase.models
             :refer
             [Activity Card Collection Dashboard DashboardCard DashboardCardSeries Database Dimension Field
              FieldValues Metric MetricImportantField NativeQuerySnippet PermissionsGroup PermissionsGroupMembership
              Pulse PulseCard PulseChannel Table User]]
            [metabase.test :as mt]
            [metabase.util.date-2.parse :as u.date]
            [reifyhealth.specmonstah.core :as rs]
            [reifyhealth.specmonstah.spec-gen :as rsg]
            [talltale.core :as tt]
            [toucan.db :as tdb]))

(def ^:private ^:const product-names
  {:adjective '[Small, Ergonomic, Rustic, Intelligent, Gorgeous, Incredible, Fantastic, Practical, Sleek, Awesome,
                Enormous, Mediocre, Synergistic, Heavy-Duty, Lightweight, Aerodynamic, Durable]
   :material '[Steel, Wooden, Concrete, Plastic, Cotton, Granite, Rubber, Leather, Silk, Wool, Linen, Marble, Iron,
               Bronze, Copper, Aluminum, Paper]
   :product '[Chair, Car, Computer, Gloves, Pants, Shirt, Table, Shoes, Hat, Plate, Knife, Bottle, Coat, Lamp,
              Keyboard, Bag, Bench, Clock, Watch, Wallet]})

(defn- random-desc
  "Return a random product name."
  []
  (format "%s %s %s"
          (rand-nth (product-names :adjective))
          (rand-nth (product-names :material))
          (rand-nth (product-names :product))))

(defn- coin-toss
  ([] (coin-toss 0.5))
  ([p] (< (rand) p)))

;; * items
(def id-seq (atom 0))
(s/def ::id (s/with-gen pos-int? #(gen/fmap (fn [_] (swap! id-seq inc)) (gen/return nil))))
(s/def ::engine #{:postgres :h2})
(s/def ::not-empty-string (s/and string? not-empty #(< (count %) 10)))

(s/def ::database (s/keys :req-un [::id ::engine ::name ::details]))
(s/def ::color #{"#A00000" "#FFFFFF"})
(s/def ::password ::not-empty-string)
(s/def ::str? (s/or :nil nil? :string string?))
(s/def ::topic ::not-empty-string)
(s/def ::details #{ "{}"})

;(s/def ::timestamp #{(t/instant)})
(s/def ::timestamp
  (s/with-gen #(instance? java.time.Instant %)
    #(gen/fmap (fn [x] (t/minus (t/instant) (t/seconds x)))
               (gen/choose 0 (* 3600 24 365 3)))))  ;; 3 years in secs

(s/def ::user_id ::id)
(s/def ::group_id ::id)

(s/def ::email
  (s/with-gen string?
    #(gen/fmap (fn [_] (tt/email))
               (gen/return nil))))

(s/def ::first_name
  (s/with-gen string?
    #(gen/fmap
      (fn [_] (tt/first-name))
      (gen/return nil))))

(s/def ::last_name
  (s/with-gen string?
    #(gen/fmap
      (fn [_] (tt/last-name))
      (gen/return nil))))

(s/def ::weird-str
  (let [reserved-words
        ["true" "True" "false" "False" "null" "nil"
         "NaN" "ARR" "Monthly" "Weekly" "updated"]]
    (s/with-gen string?
      #(gen/fmap
        (fn [_]
          (if (coin-toss 0.01)
            (rand-nth reserved-words)
            (cond-> (random-desc)
              (coin-toss 0.1)
              (str (rand-nth "áîëç£¢™🍒"))
              (coin-toss 0.01)
              (str (subs (tt/lorem-ipsum) 1 200))
              (coin-toss 0.01)
              (-> first str))))
        (gen/return nil)))))

(s/def ::name ::weird-str)
(s/def ::description ::weird-str)

;; * card
(s/def ::display #{:table})
(s/def ::visualization_settings #{"{}"})
(s/def ::dataset_query #{""})

;; * dashboardcard_series
(s/def ::position pos-int?)

;; * dimension
(s/def ::type #{"internal"})

;; * field
(s/def ::database_type #{"VARCHAR"})
(s/def ::base_type #{:type/Text})

;; * metric
(s/def ::definition #{ {} })

;; * table
(s/def ::active boolean?)

;; * native-query-snippet
(s/def ::content ::not-empty-string)
(s/def ::parameters #{[{:id "a"}]})

;; * pulse
(s/def ::row pos-int?)
(s/def ::col pos-int?)
(s/def ::col pos-int?)
(s/def ::sizeX pos-int?)
(s/def ::sizeY pos-int?)
(s/def ::parameter_mappings #{[{}]})

(s/def ::core-user (s/keys :req-un [::id ::first_name ::last_name ::email ::password]))
(s/def ::collection (s/keys :req-un [::id ::name ::color ]))
(s/def ::activity (s/keys :req-un [::id ::topic ::details ::timestamp]))
(s/def ::pulse (s/keys :req-un [::id ::name]))
(s/def ::permissions-group (s/keys :req-un [::id ::name]))
(s/def ::permissions-group-membership (s/keys :req-un [::user_id ::group_id]))
(s/def ::card (s/keys :req-un [::id ::display ::name ::visualization_settings ::dataset_query]))
(s/def ::dashboard_card_series (s/keys :req-un [::id ::position]))
(s/def ::dimension (s/keys :req-un [::id ::name ::type]))

(s/def ::field (s/keys :req-un [::id ::name ::base_type ::database_type ::position ::description]))

(s/def ::metric (s/keys :req-un [::id ::name ::definition ::description]))
(s/def ::table  (s/keys :req-un [::id ::active ::name ::description]))
(s/def ::native-query-snippet (s/keys :req-un [::id ::name ::description ::content]))
(s/def ::dashboard (s/keys :req-un [::id ::name ::description ::parameters]))

(s/def ::dashboard-card (s/keys :req-un [::id ::sizeX ::sizeY ::row ::col ::parameter_mappings ::visualization_settings ]))
(s/def ::pulse-card (s/keys :req-un [::id ::position]))


(s/def ::channel_type ::not-empty-string)
(s/def ::schedule_type ::not-empty-string)

(s/def ::pulse-channel (s/keys :req-un [::id ::channel_type ::details ::schedule_type]))

;; (gen/generate (s/gen ::collection))

;; * schema
(def schema
  {
   :permissions-group            {:prefix  :perm-g
                                  :spec    ::permissions-group
                                  :insert! {:model PermissionsGroup}}
   :permissions-group-membership {:prefix    :perm-g-m
                                  :spec      ::permissions-group-membership
                                  :relations {:group_id [:permissions-group :id]
                                              :user_id  [:core-user :id]}
                                  :insert!   {:model PermissionsGroupMembership}}
   :core-user                    {:prefix  :u
                                  :spec    ::core-user
                                  :insert! {:model User}}
   :activity                     {:prefix    :ac
                                  :spec      ::activity
                                  :relations {:user_id [:core-user :id]}
                                  :insert!   {:model Activity}}
   :database                     {:prefix  :db
                                  :spec    ::database
                                  :insert! {:model Database}}
   :collection                   {:prefix    :coll
                                  :spec      ::collection
                                  :insert!   {:model Collection}
                                  :relations {:personal_owner_id [:core-user :id]}}
   :pulse                        {:prefix    :pulse
                                  :spec      ::pulse
                                  :insert!   {:model Pulse}
                                  :relations {:creator_id    [:core-user :id]
                                              :collection_id [:collection :id]}}
   :card                         {:prefix    :c
                                  :spec      ::card
                                  :insert!   {:model Card}
                                  :relations {:creator_id  [:core-user :id]
                                              :database_id [:database :id]}}
   :dashboard                    {:prefix    :d
                                  :spec      ::dashboard
                                  :insert!   {:model Dashboard}
                                  :relations {:creator_id    [:core-user :id]
                                              :collection_id [:collection :id]}}
   :dashboard-card               {:prefix    :dc
                                  :spec      ::dashboard-card
                                  :insert!   {:model DashboardCard}
                                  :relations {:card_id      [:card :id]
                                              :dashboard_id [:dashboard :id]}}
   :dashboard-card-series        {:prefix  :dcs
                                  :spec    ::dashboard_card_series
                                  :insert! {:model DashboardCardSeries}}
   :dimension                    {:prefix  :dim
                                  :spec    ::dimension
                                  :insert! {:model Dimension}}
   :field                        {:prefix      :field
                                  :spec        ::field
                                  :insert!     {:model Field}
                                  :relations   {:table_id [:table :id]}
                                  :constraints {:table_id #{:uniq}}}
   :metric                       {:prefix    :metric
                                  :spec      ::metric
                                  :insert!   {:model Metric}
                                  :relations {:creator_id [:core-user :id]
                                              :table_id   [:table :id]}}
   :table                        {:prefix    :t
                                  :spec      ::table
                                  :insert!   {:model Table}
                                  :relations {:db_id [:database :id]}}
   :native-query-snippet         {:prefix    :nqs
                                  :spec      ::native-query-snippet
                                  :insert!   {:model NativeQuerySnippet}
                                  :relations {:creator_id    [:core-user :id]
                                              :collection_id [:collection :id]}}
   :pulse-card                   {:prefix    :pulse-card
                                  :spec      ::pulse-card
                                  :insert!   {:model PulseCard}
                                  :relations {:pulse_id [:pulse :id]
                                              :card_id  [:card :id]}}
   :pulse-channel                {:prefix    :pulse-channel
                                  :spec      ::pulse-channel
                                  :insert!   {:model PulseChannel}
                                  :relations {:pulse_id [:pulse :id]}}

   ;; :revision {}
   ;; :segment {}
   ;; :task-history {}
   })

;; * inserters
(defn- spec-gen
  [query]
  (rsg/ent-db-spec-gen {:schema schema} query))

(def ^:private field-positions (atom {:table-fields {}}))
(defn- adjust
  "Some fields have to be semantically correct, or db correct. fields have position, and they do have to be unique.
  in the table-field-position, for now it's just incrementing forever, without scoping by table_id (which would be
  cool)."
  [sm-db {:keys [schema-opts attrs ent-type visit-val] :as visit-opts}]
  (cond-> visit-val
    ;; Fields have a unique position per table. Keep a counter of the number of fields per table and update it, giving
    ;; the new value to the current field. Defaults to 1.
    (= :field ent-type)
    (assoc :position
           (-> (swap! field-positions update-in [:table-fields (:table_id visit-val)] (fnil inc 0))
               (get-in [:table-fields (:table_id visit-val)])))

    (and (:description visit-val) (coin-toss 0.2))
    (dissoc :description)))

(defn- remove-ids [_ {:keys [visit-val] :as visit-opts}]
  (dissoc visit-val :id))

(defn insert!
  "Insert pseudorandom entities to the current database according to `query` specmonstah spec. The process follows
  several steps while building the entities:

  - Generate fixture data from specs.
  - Remove all id fields, so that the application database can provide its own autogenerated ids.
  - Adjust entites, in case some fields need extra tunning like incremental position, or collections.location
  - Insert entity into the db using `toucan.core/insert!` "
  [query]
  (-> (spec-gen query)
      (rs/visit-ents :spec-gen remove-ids)
      (rs/visit-ents :spec-gen adjust)
      (rs/visit-ents-once
       :insert! (fn [sm-db {:keys [schema-opts attrs] :as visit-opts}]
                  (try
                    (tdb/insert! (:model schema-opts)
                      (rsg/spec-gen-assoc-relations
                       sm-db
                       (assoc visit-opts :visit-val (:spec-gen attrs))))
                    (catch Throwable e
                      (println e)))))
      (rs/attr-map :insert!)))

(defn generate-horror-show! []
  (let [horror-show {:collection [[1 {:refs {:personal_owner_id ::rs/omit}}]]
                     :dashboard  [[5000]]
                     :card       [[50000]]}]
    (insert! horror-show)
    nil))
