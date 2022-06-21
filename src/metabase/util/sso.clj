(ns metabase.util.sso
  "Functions shared by the various SSO implementations"
  (:require [clojure.tools.logging :as log]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings] ;; need to replace this so it works in OSS situations
            [metabase.api.common :as api]
            [metabase.email.messages :as messages]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [java.net MalformedURLException URL URLDecoder]
           java.util.UUID))
