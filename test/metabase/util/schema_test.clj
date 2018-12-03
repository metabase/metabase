(ns metabase.util.schema-test
  "Tests for utility schemas and various API helper functions."
  (:require [compojure.core :refer [POST]]
            [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :as i18n]
            [schema.core :as s]))

;; check that the API error message generation is working as intended
(expect
  (str "value may be nil, or if non-nil, value must satisfy one of the following requirements: "
       "1) value must be a boolean. "
       "2) value must be a valid boolean string ('true' or 'false').")
  (str (su/api-error-message (s/maybe (s/cond-pre s/Bool su/BooleanString)))))

;; check that API error message respects `api-param` when specified
(api/defendpoint POST "/:id/dimension"
  "Sets the dimension for the given object with ID."
  [id :as {{dimension-type :type, dimension-name :name} :body}]
  {dimension-type          (su/api-param "type" (s/enum "internal" "external"))
   dimension-name          su/NonBlankString})
(alter-meta! #'POST_:id_dimension assoc :private true)

(expect
  (str "## `POST metabase.util.schema-test/:id/dimension`\n"
       "\n"
       "Sets the dimension for the given object with ID.\n"
       "\n"
       "##### PARAMS:\n"
       "\n"
       "*  **`id`** \n"
       "\n"
       "*  **`type`** value must be one of: `external`, `internal`.\n"
       "\n"
       "*  **`dimension-name`** value must be a non-blank string.")
  (:doc (meta #'POST_:id_dimension)))

(defn- ex-info-msg [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (.getMessage e))))

(expect
  #"INTEGER GREATER THAN ZERO"
  (let [zz (i18n/string-as-locale "zz")]
    (i18n/with-user-locale zz
      (ex-info-msg #(s/validate su/IntGreaterThanZero -1)))))
