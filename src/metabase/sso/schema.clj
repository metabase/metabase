(ns metabase.sso.schema
  "Malli schemas for the SSO module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::group-mappings
  "An identity provider's groups mapped to the Metabase group IDs that membership in them grants. The keys are the
  provider's -- LDAP group DNs, SAML and JWT group names -- so the map is string-keyed on its way in; it is stored as a
  JSON setting and read back through that setting's own decoder."
  (ms/string-keyed-map [:sequential ms/PositiveInt]))
