(ns metabase.queries.template-tags
  "Pure conversion of a Card's native-query template tags into parameters. Kept out
  of [[metabase.queries.models.card]] so the query processor can use it without depending on the Card model."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]))

(mu/defn parameter-template-tag? :- :boolean
  "Whether a parameter is created for this template tag, as opposed to tags that splice content into the query itself,
  like snippets, card references, and tables."
  [{tag-type :type, widget-type :widget-type} :- [:maybe ::lib.schema.template-tag/template-tag]]
  (boolean
   (and tag-type
        (or (contains? lib.schema.template-tag/raw-value-template-tag-types tag-type)
            (= tag-type :temporal-unit)
            (and (= tag-type :dimension) widget-type (not= widget-type :none))))))

;;;
;;; NOTE: this should mirror `getTemplateTagParameters` in frontend/src/metabase-lib/parameters/utils/template-tags.ts
;;; If this function moves you should update the comment that links to this one (#40013)
;;;
;;; TODO -- does this belong HERE or in the `parameters` module?
(mu/defn template-tag-parameters :- ::parameters.schema/parameters
  "Transforms native query's `template-tags` into `parameters`.
  An older style was to not include `:template-tags` onto cards as parameters. I think this is a mistake and they
  should always be there. Apparently lots of e2e tests are sloppy about this so this is included as a convenience."
  [card :- [:maybe ::queries.schema/card]]
  (for [{tag-type :type, widget-type :widget-type, :as tag} (some-> card :dataset_query not-empty lib/all-template-tags)
        :when                         (parameter-template-tag? tag)]
    {:id       (:id tag)
     :type     (or widget-type (case tag-type
                                 :temporal-unit :temporal-unit
                                 :date    :date/single
                                 :text    :string/=
                                 :number  :number/=
                                 :boolean :boolean/=
                                 ;; fallback; should be unreachable since :when filters
                                 ;; to raw-value-template-tag-types
                                 :string/=))
     :target   (if (contains? #{:dimension :temporal-unit} tag-type)
                 [:dimension [:template-tag (:name tag)]]
                 [:variable  [:template-tag (:name tag)]])
     :name     (:display-name tag)
     :slug     (:name tag)
     :default  (:default tag)
     :required (boolean (:required tag))}))
