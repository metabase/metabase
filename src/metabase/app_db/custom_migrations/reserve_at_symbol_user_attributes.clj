(ns metabase.app-db.custom-migrations.reserve-at-symbol-user-attributes
  "Going forward, we want to reserve user attributes startings with `@` for our own use.

  To support this, we will automatically migrate existing user attributes beginning with `@` to instead begin with
  `_@`.

  This is not the most efficient operation, because user attributes are arbitrary maps of JSON, making it difficult to
  do this in the database (especially given the number of databases we support). So instead, we can:

  - calculate the map of `user-attribute->new-name-for-existing-user-attribute` (generally, this will be something
    like `@foo => _@foo`, but in some cases an existing user attribute may block this rename, forcing us to use, e.g.,
    `__@foo`)
  - find all usages of each user attribute that will be renamed in:
    - users,
    - sandboxes,
    - impersonations, or
    - DB routing configurations
  - rename each of the above.


  NOTE: Some of these operations are quite inefficient! For example, to migrate a user attribute, we will, for each
  renamed user attribute, go through each user whose attributes contain that attribute, rename it, and then move on to
  the next user.

  If we had thousands of attributes starting with `@` and thousands of users with those attributes this behavior could
  be *quite* horrible.

  However, I think it's quite probable that we have somewhere on the order of ~1 user attribute anywhere that this
  code will actually run on, plus this will only run one time per Metabase install, so I'd rather not spend a ton of
  time optimizing for an incredibly unlikely case."
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as cheshire]
   [clojure.set :as set]
   [toucan2.core :as t2]))

(defn- parse-json [s] (cheshire/parse-string s false))
(defn- to-json [o] (cheshire/generate-string o))

(defn- migrate-sandboxes!
  [old-attr new-attr]
  (let [sandboxes (t2/select :sandboxes {:where [:like :attribute_remappings (str "%" old-attr "%")]})]
    (doseq [{:keys [id attribute_remappings]} sandboxes]
      (let [attribute-remappings (parse-json attribute_remappings)
            new-attribute-remappings (set/rename-keys attribute-remappings {old-attr new-attr})]
        ;; yes this is n+1 but we're not expecting big numbers here.
        (when (not= new-attribute-remappings attribute-remappings)
          (t2/update! :sandboxes :id id {:attribute_remappings (to-json new-attribute-remappings)}))))))

(defn- migrate-db-routing! [old-attr new-attr]
  (t2/update! :db_router :user_attribute old-attr {:user_attribute new-attr}))

(defn- migrate-impersonations! [old-attr new-attr]
  (t2/update! :connection_impersonations :attribute old-attr {:attribute new-attr}))

(defn- migrate-users! [old-attr new-attr]
  (let [users (t2/select :core_user :login_attributes [:like (str "%" old-attr "%")])]
    (doseq [{:keys [id login_attributes]} users]
      (let [login-attributes (parse-json login_attributes)
            new-login-attributes (set/rename-keys login-attributes {old-attr new-attr})]
        (when (not= login-attributes new-login-attributes)
          (t2/update! :core_user :id id {:login_attributes (to-json new-login-attributes)}))))))

(defn- find-rename-option
  "We want to rename `@foo` to `_@foo`, but maybe there's already an `_@foo`, so just keep adding `_` until it's available."
  [attrs k]
  (->> k
       (iterate #(str "_" %))
       (remove #(contains? attrs %))
       first))

(defn- all-possibly-relevant-user-attributes
  []
  (into #{}
        (comp
         (map parse-json)
         (mapcat keys)
         ;; we can't just check for *begins* with here, because we need to include cases that *might* be clobbered by renames.
         (filter #(re-matches #"^(_+)?@.+" %)))
        (t2/select-fn-reducible :login_attributes [:core_user :login_attributes]
                                {:where [:and
                                         [:not= :login_attributes nil]
                                         [:not= :login_attributes "{}"]
                                         ;; contains a `"@`, a string starting with a `@` (it could be in a value
                                         ;; though, so we need to check later.)
                                         [:or
                                          [:like :login_attributes "%\"_"]
                                          [:like :login_attributes "%\"@%"]]]})))

(defn migrate!
  "We want to reserve any user attributes starting with `@`. To do this safely, we will rename any existing user attributes "
  []
  (let [all-attrs (all-possibly-relevant-user-attributes)]
    (doseq [attr all-attrs
            :when (= (first attr) \@)
            :let [new-attr (find-rename-option all-attrs attr)]]
      (migrate-users! attr new-attr)
      (migrate-sandboxes! attr new-attr)
      (migrate-db-routing! attr new-attr)
      (migrate-impersonations! attr new-attr))))
