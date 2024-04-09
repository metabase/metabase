(ns metabase-enterprise.advanced-config.file.interface
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defmulti section-spec
  "Spec that should be used to validate the config section with `section-name`, e.g. `:users`. Default spec
  is [[any?]].

  Sections are validated BEFORE template expansion, so as to avoid leaking any sensitive values in spec errors. Write
  your specs accordingly!

  Implementations of this method live in other namespaces. For example, the section spec for the `:users` section
  lives in [[metabase.models.user]]."
  {:arglists '([section-name])}
  keyword)

(defmethod section-spec :default
  [_section-name]
  any?)

(defmulti initialize-section!
  "Execute initialization code for the section of the init config file with the key `section-name` and value
  `section-config`.

  Implementations of this method live in other namespaces, for example the method for the `:users` section (to
  initialize Users) lives in [[metabase.models.user]]."
  {:arglists '([section-name section-config])}
  (fn [section-name _section-config]
    (keyword section-name)))

;;; if we don't know how to initialize a particular section, just log a warning and proceed. This way we can be
;;; forward-compatible and handle sections that might be unknown in a particular version of Metabase.
(defmethod initialize-section! :default
  [section-name _section-config]
  (log/warn (u/format-color :yellow "Ignoring unknown config section %s." (pr-str section-name))))
