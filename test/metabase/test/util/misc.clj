(ns metabase.test.util.misc
  "Misc test util functions that didn't really fit anywhere else."
  (:require
   [clojure.data :as data]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [mb.hawk.init]
   [metabase.models :refer [PermissionsGroupMembership User]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test.initialize :as initialize]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(defn do-with-clock [clock thunk]
  (testing (format "\nsystem clock = %s" (pr-str clock))
    (let [clock (cond
                  (t/clock? clock)           clock
                  (t/zoned-date-time? clock) (t/mock-clock (t/instant clock) (t/zone-id clock))
                  :else                      (throw (Exception. (format "Invalid clock: ^%s %s"
                                                                        (.getName (class clock))
                                                                        (pr-str clock)))))]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (t/with-clock clock
        (thunk)))))

(defmacro with-clock
  "Same as [[t/with-clock]], but adds [[testing]] context, and also supports using `ZonedDateTime` instances
  directly (converting them to a mock clock automatically).

    (mt/with-clock #t \"2019-12-10T00:00-08:00[US/Pacific]\"
      ...)"
  [clock & body]
  `(do-with-clock ~clock (fn [] ~@body)))

(defn do-with-single-admin-user
  [attributes thunk]
  (let [existing-admin-memberships (t2/select PermissionsGroupMembership :group_id (:id (perms-group/admin)))
        _                          (t2/delete! (t2/table-name PermissionsGroupMembership) :group_id (:id (perms-group/admin)))
        existing-admin-ids         (t2/select-pks-set User :is_superuser true)
        _                          (when (seq existing-admin-ids)
                                     (t2/update! (t2/table-name User) {:id [:in existing-admin-ids]} {:is_superuser false}))
        temp-admin                 (first (t2/insert-returning-instances! User (merge (t2.with-temp/with-temp-defaults User)
                                                                                      attributes
                                                                                      {:is_superuser true})))]
    (try
      (thunk temp-admin)
      (finally
        (t2/delete! User (:id temp-admin))
        (when (seq existing-admin-ids)
          (t2/update! (t2/table-name User) {:id [:in existing-admin-ids]} {:is_superuser true}))
        (t2/insert! PermissionsGroupMembership existing-admin-memberships)))))

(defmacro with-single-admin-user
  "Creates an admin user (with details described in the `options-map`) and (temporarily) removes the administrative
  powers of all other users in the database.

  Example:

  (testing \"Check that the last superuser cannot deactivate themselves\"
    (mt/with-single-admin-user [{id :id}]
      (is (= \"You cannot remove the last member of the 'Admin' group!\"
             (mt/user-http-request :crowberto :delete 400 (format \"user/%d\" id))))))"
  [[binding-form & [options-map]] & body]
  `(do-with-single-admin-user ~options-map (fn [~binding-form]
                                             ~@body)))

(def ^{:arglists '([toucan-model])} object-defaults
  "Return the default values for columns in an instance of a `toucan-model`, excluding ones that differ between
  instances such as `:id`, `:name`, or `:created_at`. Useful for writing tests and comparing objects from the
  application DB. Example usage:

    (deftest update-user-first-name-test
      (t2.with-temp/with-temp [User user]
        (update-user-first-name! user \"Cam\")
        (is (= (merge (mt/object-defaults User)
                      (select-keys user [:id :last_name :created_at :updated_at])
                      {:name \"Cam\"})
               (mt/decrecordize (t2/select-one User :id (:id user)))))))"
  (comp
   (memoize
    (fn [toucan-model]
      (t2.with-temp/with-temp [toucan-model x {}
                               toucan-model y {}]
        (let [[_ _ things-in-both] (data/diff x y)]
          ;; don't include created_at/updated_at even if they're the exactly the same, as might be the case with MySQL
          ;; TIMESTAMP columns (which only have second resolution by default)
          (dissoc things-in-both :created_at :updated_at)))))
   (fn [toucan-model]
     (mb.hawk.init/assert-tests-are-not-initializing (list 'object-defaults (symbol (name toucan-model))))
     (initialize/initialize-if-needed! :db)
     (t2.model/resolve-model toucan-model))))
