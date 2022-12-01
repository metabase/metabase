(ns metabase.models.json-migration)

(defn update-version
  "Set the updated version if the column-value has data. Doesn't do anything if it's empty since empty values are
  assumed to result in version-appropriate default behavior and don't need an explicit version key."
  [column-value desired-version]
  (if (seq column-value)
    (assoc column-value :version desired-version)
    column-value))

(defmacro def-json-migration
  "Create a multi-method with the given name that will perform JSON migrations. Individual cases (with appropriate
  logic!) must be defined by the user. The resulting multi-method accepts two arguments: the value of the column and
  the desired version. Versioning is assumed to start at 1 and be stored in the JSON blob under the `:version`
  key (and no version at all is assumed to be 1 as well). Updating the version is *not* handled here; in practice you
  should probably chain the migration method together with `update-version` (defined above). Non-upgrades (e.g.,
  upgrading a value from version 2 to version 2) are handled and treated as a no-op.

  For example, imagine a User model with a JSON column called `login_settings`. This originally contained a boolean
  key `remember_me` that persisted a session for 30 days, but the number of days is now configurable per user. The
  migration code would look like this:

      (def login-settings-version 2)

      (def-json-migration migrate-login-settings*)

      (defmethod migrate-login-settings* [1 2] [login-settings _version]
        (assoc login-settings :remember_me_days (if (:remember_me login-settings) 30 0)))

      (defn migrate-login-settings
        [login-settings] ;; note that this only takes the one argument, not two
        (-> login-settings
            (migrate-login-settings* login-settings-version)
            (update-version login-settings-version)))

      (migrate-login-settings {:remember_me true})                 ;; => {:remember_me_days 30, :version 2, :remember_me true}
      (migrate-login-settings {:remember_me false})                ;; => {:remember_me_days 0,  :version 2, :remember_me false}
      (migrate-login-settings {:remember_me true, :version 1})     ;; => {:remember_me_days 30, :version 2, :remember_me true}
      (migrate-login-settings {:remember_me_days 15, :version 2})  ;; => {:remember_me_days 15, :version 2}"
  [name]
  (let [name* name]
    `(do
       (defmulti ^:private ~name*
         "Migrate the column value to the appropriate version."
         {:arglists '([~'column-value ~'desired-version])}
         (fn [~'column-value ~'desired-version]
           (let [~'current-version (or (get ~'column-value :version) 1)]
             (if (= ~'current-version ~'desired-version)
               ::identity
               [~'current-version ~'desired-version]))))

       (defmethod ^:private ~name* ::identity [~'column-value ~'_]
         ~'column-value))))
