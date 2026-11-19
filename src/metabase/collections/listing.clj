(ns metabase.collections.listing
  "HoneySQL helpers for the queries that list collection content and table content readable by a user: the content of
  the collections they read, the content of the tables they query, the location of an item in its collection, and the
  items outside personal collections, and the ones that list the items of one collection: the Collections whose items
  the user sees and the items of the pinned state a listing asks for."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def User
  "The user whose readable items a list holds, in a map of the list's options."
  [:map
   [:user-id          pos-int?]
   [:is-superuser?    {:optional true} [:maybe :boolean]]
   [:is-data-analyst? {:optional true} [:maybe :boolean]]])

(def IncludeArchived
  "Which items a list holds by their archived state, or that of their collection."
  [:enum :exclude :all :only])

(mu/defn archived-clause :- [:maybe ::h2x/honeysql-expr]
  "The rows of `alias` that `include-archived` keeps by their `archived` column, nil for all of them."
  [alias            :- :keyword
   include-archived :- IncludeArchived]
  (case include-archived
    :exclude [:= (u/qualified-key alias :archived) false]
    :only    [:= (u/qualified-key alias :archived) true]
    :all     nil))

(mu/defn visible-in-collections-clause :- ::h2x/honeysql-expr
  "The rows of `alias` in the collections under the root of `root-namespace` that `user` reads, with the archived ones
  that `include-archived` keeps."
  [alias                                            :- :keyword
   {:keys [user-id is-superuser? is-data-analyst?]} :- User
   include-archived                                 :- IncludeArchived
   root-namespace                                   :- [:maybe :keyword]]
  (perms/visible-collections-filter-clause (u/qualified-key alias :collection_id)
                                           {:user-id          user-id
                                            :is-superuser?    (boolean is-superuser?)
                                            :is-data-analyst? (boolean is-data-analyst?)}
                                           {:include-archived-items include-archived
                                            :root-namespace         root-namespace}))

(mu/defn visible-tables-clause :- ::h2x/honeysql-expr
  "The rows whose table id `table-id-column` is that of a table, active or not, that `user` queries."
  [table-id-column                 :- :keyword
   {:keys [user-id is-superuser?]} :- User]
  (perms/visible-tables-filter-clause table-id-column
                                      (assoc (perms/user-info user-id) :is-superuser? is-superuser?)
                                      {:perms/view-data :unrestricted :perms/create-queries :query-builder}
                                      {:active-only? false, :include-published-via-collection? false}))

(mu/defn collection-location :- ::h2x/honeysql-expr
  "The name of the collection joined as `collection-alias`, or of the root of `root-namespace` for an item at the
  root."
  [collection-alias :- :keyword
   root-namespace   :- [:maybe :keyword]]
  [:coalesce (u/qualified-key collection-alias :name)
   (:name (collection.root/root-collection-with-ui-details root-namespace))])

(mu/defn outside-personal-collections-clause :- [:maybe ::h2x/honeysql-expr]
  "The rows of `alias` outside the personal collections, its collection joined as `collection-alias`, nil when there
  is none."
  [alias            :- :keyword
   collection-alias :- :keyword]
  (when-let [personal-ids (not-empty (collections.db/personal-root-collection-ids))]
    [:or
     [:= (u/qualified-key alias :collection_id) nil]
     [:and
      [:= (u/qualified-key collection-alias :personal_owner_id) nil]
      (into [:and]
            (for [pid personal-ids]
              [:not-like (u/qualified-key collection-alias :location) (str "/" pid "/%")]))]]))

(def ^:private always-true-hsql-expr
  "A Honey SQL expression that is always true.

    1 = 1"
  [:= [:inline 1] [:inline 1]])

(def ^:private always-false-hsql-expr
  "A Honey SQL expression that is never true.

    1 = 2"
  [:= [:inline 1] [:inline 2]])

(defn poison-when-pinned-clause
  "The clause that keeps no row when `pinned-state` is `:is_pinned` and all of them otherwise, for the items that have
  no notion of pinning."
  [pinned-state]
  (if (= pinned-state :is_pinned)
    always-false-hsql-expr
    always-true-hsql-expr))

(defn pinned-state->clause
  "The clause keeping the rows whose `col`, their `:collection_position` by default, is that of `pinned-state`, `:all`,
  `:is_pinned` or `:is_not_pinned`, all of them for another one."
  ([pinned-state]
   (pinned-state->clause pinned-state :collection_position))
  ([pinned-state col]
   (case pinned-state
     :all           always-true-hsql-expr
     :is_pinned     [:<> col nil]
     :is_not_pinned [:= col nil]
     always-true-hsql-expr)))

(defn visible-items-options
  "The `perms/visible-collections-filter-clause` options of a listing of Collection items, of the trash when
  `archived?`, a nil collection id standing for the root Collection of the `:root-namespace` option."
  [archived? {:keys [root-namespace]}]
  {:include-archived-items    :all
   :permission-level          (if archived? :write :read)
   :include-trash-collection? (boolean archived?)
   :root-namespace            root-namespace})

(defn visible-items-clause
  "The where-clause keeping the items whose Collection, by `collection-id-field`, the current user sees in this listing:
  the Collections they can read, or write when listing the trash, the trash then included, a nil collection id standing
  for the root Collection of the `:root-namespace` option, which they only have to read in either listing."
  [collection-id-field archived? options]
  (let [clause (fn [permission-level]
                 (perms/visible-collections-filter-clause collection-id-field
                                                          (api/current-user-info)
                                                          (assoc (visible-items-options archived? options)
                                                                 :permission-level permission-level)))]
    (if archived?
      [:or
       [:and [:= collection-id-field nil] (clause :read)]
       [:and [:not= collection-id-field nil] (clause :write)]]
      (clause :read))))
