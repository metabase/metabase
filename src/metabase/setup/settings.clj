(ns metabase.setup.settings
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [toucan2.core :as t2]))

;;; TODO -- we actually do set this so it probably shouldn't be `:setter :none`. `:setter :none` is meant for settings
;;; whose values are programmatically generated -- Cam
(defsetting setup-token
  "A token used to signify that an instance has permissions to create the initial User. This is created upon the first
  launch of Metabase, by the first instance; once used, it is cleared out, never to be used again."
  :visibility :public
  :setter     :none
  :audit      :never)

(let [app-db-id->user-exists? (atom {})]
  (defn- -has-user-setup []
    (let [possible-override (when (or config/is-dev? config/is-test?)
                              ;; allow for overriding in dev and test
                              (setting/get-value-of-type :boolean :has-user-setup))]
      ;; override could be false so have to check non-nil
      (if (some? possible-override)
        possible-override
        (or (get @app-db-id->user-exists? (mdb/unique-identifier))
            (let [exists? (boolean (seq (t2/select :model/User {:where [:not= :id config/internal-mb-user-id]})))]
              (swap! app-db-id->user-exists? assoc (mdb/unique-identifier) exists?)
              exists?))))))

(defsetting has-user-setup
  (deferred-tru "A value that is true iff the metabase instance has one or more users registered.")
  :visibility :public
  :type       :boolean
  :setter     (fn [value]
                (if (or config/is-dev? config/is-test?)
                  (setting/set-value-of-type! :boolean :has-user-setup value)
                  (throw (ex-info (tru "Cannot set `has-user-setup`.")
                                  {:value value}))))
  ;; Once a User is created it's impossible for this to ever become falsey -- deleting the last User is disallowed.
  ;; After this returns true once the result is cached and it will continue to return true forever without any
  ;; additional DB hits.
  ;;
  ;; This is keyed by the unique identifier for the application database, to support resetting it in tests or swapping
  ;; it out in the REPL
  :getter     #'-has-user-setup
  :doc        false
  :audit      :never)
