(ns metabase.public-sharing.test-util
  "Shared helpers for tests of the public sharing module and of the endpoints that create public links.")

(defn anonymous-access-refused-message
  "What a public-link creation endpoint says when the object sits on a routed database that does not allow anonymous
  access. Kept here so the card and dashboard tests assert one wording. See
  [[metabase.public-sharing.validation/check-public-link-allowed!]]."
  [database-name]
  (format (str "%s has database routing enabled and does not allow anonymous access, so a public link on it would"
               " return no data.")
          database-name))
