(ns metabase.lib.schema.parameter
  "`:parameters` specify the *values* of parameters previously definied for a Dashboard or Card (native query template
  tag parameters.) See [[metabase.lib.schema.template-tag]] above for more information on the later.

  There are three things called 'type' in play when we talk about parameters and template tags.

  Two are used when the parameters are specified/declared, in a [[TemplateTag]] or in a Dashboard parameter:

  1. Dashboard parameter/template tag `:type` -- `:dimension` (for a Field filter parameter),
     otherwise `:text`, `:number`, `:boolean`, or `:date`

  2. `:widget-type` -- only specified for Field filter parameters (where type is `:dimension`). This tells the FE
     what type of widget to display, and also tells us what types of parameters we should allow. Examples:
     `:date/all-options`, `:category`, etc.

  One type is used in the [[Parameter]] list (`:parameters`):

  3. Parameter `:type` -- specifies the type of the value being passed in. e.g. `:text` or `:string/!=`

  Note that some types that makes sense as widget types (e.g. `:date/all-options`) but not as actual value types are
  currently still allowed for backwards-compatibility purposes -- currently the FE client will just parrot back the
  `:widget-type` in some cases. In these cases, the backend is just supposed to infer the actual type of the parameter
  value."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(defn- variadic-opts-first
  "Some clauses, like `:contains`, have optional `options` last in their binary form, and required options first in
  variadic form."
  [[tag & args :as clause] options]
  (if (<= (count args) 2)
    (cond-> clause
      options (conj options))
    (into [tag (or options {})] args)))

(def types
  "Map of parameter-type -> info. Info is a map with the following keys:

  ### `:type`

  The general type of this parameter. `:numeric`, `:string`, `:boolean`, or `:date`, if applicable. Some parameter
  types like `:id` and `:category` don't have a particular `:type`. This is offered mostly so we can group stuff
  together or determine things like whether a given parameter is a date parameter.

  ### `:operator`

  Signifies this is one of the new 'operator' parameter types added in 0.39.0 or so. These parameters can only be used
  for [[TemplateTag:FieldFilter]]s or for Dashboard parameters mapped to MBQL queries. The value of this key is the
  arity for the parameter, either `:unary`, `:binary`, or `:variadic`. See
  the [[metabase.driver.common.parameters.operators]] namespace for more information.

  ### `:allowed-for`

  [[Parameter]]s with this `:type` may be supplied for [[TemplateTag]]s with these `:type`s (or `:widget-type` if
  `:type` is `:dimension`) types. Example: it is ok to pass a parameter of type `:date/range` for template tag with
  `:widget-type` `:date/all-options`; but it is NOT ok to pass a parameter of type `:date/range` for a template tag
  with a widget type `:date`. Why? It's a potential security risk if someone creates a Card with an \"exact-match\"
  Field filter like `:date` or `:text` and you pass in a parameter like `string/!=` `NOTHING_WILL_MATCH_THIS`.
  Non-exact-match parameters can be abused to enumerate *all* the rows in a table when the parameter was supposed to
  lock the results down to a single row or set of rows.

  ### `:options-fn`

  Optional, specifies a function `(f clause-without-options options-map-or-nil) => clause-with-options` to be used for
  attaching the options. The default is to `conj` non-nil options on the end."
  {;; the basic raw-value types. These can be used with [[TemplateTag:RawValue]] template tags as well as
   ;; [[TemplateTag:FieldFilter]] template tags.
   :number  {:type :numeric, :allowed-for #{:number :number/= :id :category :location/zip_code}}
   :text    {:type :string,  :allowed-for #{:text :string/= :id :category
                                            :location/city :location/state :location/zip_code :location/country}}
   :date    {:type :date,    :allowed-for #{:date :date/single :date/all-options :id :category}}
   ;; I don't think `:boolean` is actually used on the FE at all.
   :boolean {:type :boolean, :allowed-for #{:boolean :id :category}}

   ;; as far as I can tell this is basically just an alias for `:date`... I'm not sure what the difference is TBH
   :date/single {:type :date, :allowed-for #{:date :date/single :date/all-options :id :category}}

   ;; everything else can't be used with raw value template tags -- they can only be used with Dashboard parameters
   ;; for MBQL queries or Field filters in native queries

   ;; `:id` and `:category` conceptually aren't types in a "the parameter value is of this type" sense, but they are
   ;; widget types. They have something to do with telling the frontend to show FieldValues list/search widgets or
   ;; something like that.
   ;;
   ;; Apparently the frontend might still pass in parameters with these types, in which case we're supposed to infer
   ;; the actual type of the parameter based on the Field we're filtering on. Or something like that. Parameters with
   ;; these types are only allowed if the widget type matches exactly, but you can also pass in something like a
   ;; `:number/=` for a parameter with widget type `:category`.
   ;;
   ;; TODO FIXME -- actually, it turns out the the FE client passes parameter type `:category` for parameters in
   ;; public Cards. Who knows why! For now, we'll continue allowing it. But we should fix it soon. See
   ;; [[metabase.api.public-test/execute-public-card-with-parameters-test]]
   :id       {:allowed-for #{:id}}
   :category {:allowed-for #{:category #_FIXME :number :text :date :boolean}}

   ;; Like `:id` and `:category`, the `:location/*` types are primarily widget types. They don't really have a meaning
   ;; as a parameter type, so in an ideal world they wouldn't be allowed; however it seems like the FE still passed
   ;; these in as parameter type on occasion anyway. In this case the backend is just supposed to infer the actual
   ;; type -- which should be `:text` and, in the case of ZIP code, possibly `:number`.
   ;;
   ;; As with `:id` and `:category`, it would be preferable to just pass in a parameter with type `:text` or `:number`
   ;; for these widget types, but for compatibility we'll allow them to continue to be used as parameter types for the
   ;; time being. We'll only allow that if the widget type matches exactly, however.
   :location/city     {:allowed-for #{:location/city}}
   :location/state    {:allowed-for #{:location/state}}
   :location/zip_code {:allowed-for #{:location/zip_code}}
   :location/country  {:allowed-for #{:location/country}}

   ;; date range types -- these match a range of dates
   :date/range        {:type :date, :allowed-for #{:date/range :date/all-options}}
   :date/month-year   {:type :date, :allowed-for #{:date/month-year :date/all-options}}
   :date/quarter-year {:type :date, :allowed-for #{:date/quarter-year :date/all-options}}
   :date/relative     {:type :date, :allowed-for #{:date/relative :date/all-options}}

   ;; Like `:id` and `:category` above, `:date/all-options` is primarily a widget type. It means that we should allow
   ;; any date option above.
   :date/all-options {:type :date, :allowed-for #{:date/all-options}}

   ;; `:temporal-unit` is a specialized type of parameter, and specialized widget. In MBQL queries, it maps only to
   ;; breakout columns which have temporal bucketing set, and overrides the unit from the query.
   ;; The value for this type of parameter is one of the temporal units from [[metabase.lib.schema.temporal-bucketing]].
   ;; TODO: Document how this works for native queries.
   :temporal-unit    {:allowed-for #{:temporal-unit}}

   ;; "operator" parameter types.
   :number/!=               {:type :numeric, :operator :variadic, :allowed-for #{:number/!=}}
   :number/<=               {:type :numeric, :operator :unary, :allowed-for #{:number/<=}}
   :number/=                {:type :numeric, :operator :variadic, :allowed-for #{:number/= :number :id :category
                                                                                 :location/zip_code}}
   :number/>=               {:type :numeric, :operator :unary, :allowed-for #{:number/>=}}
   :number/between          {:type :numeric, :operator :binary, :allowed-for #{:number/between}}
   :string/!=               {:type :string, :operator :variadic, :allowed-for #{:string/!=}}
   :string/=                {:type :string, :operator :variadic, :allowed-for #{:string/= :text :id :category
                                                                                :location/city :location/state
                                                                                :location/zip_code :location/country}}
   :string/contains         {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/contains}}
   :string/does-not-contain {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/does-not-contain}}
   :string/ends-with        {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/ends-with}}
   :string/starts-with      {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/starts-with}}})

(mr/def ::type
  (into [:enum {:error/message    "valid parameter type"
                :decode/normalize lib.schema.common/normalize-keyword}]
        (keys types)))

(mr/def ::widget-type
  (into [:enum
         {:error/message    "valid template tag widget type"
          :decode/normalize lib.schema.common/normalize-keyword}
         :none]
        (keys types)))

;; the next few clauses are used for parameter `:target`... this maps the parameter to an actual template tag in a
;; native query or Field for MBQL queries.
;;
;; examples:
;;
;;    {:target [:dimension [:template-tag "my_tag"]]}
;;    {:target [:dimension [:template-tag {:id "my_tag_id"}]]}
;;    {:target [:variable [:template-tag "another_tag"]]}
;;    {:target [:variable [:template-tag {:id "another_tag_id"}]]}
;;    {:target [:dimension [:field 100 nil]]}
;;    {:target [:field 100 nil]}
;;
;; I'm not 100% clear on which situations we'll get which version. But I think the following is generally true:
;;
;; * Things are wrapped in `:dimension` when we're dealing with Field filter template tags
;; * Raw value template tags wrap things in `:variable` instead
;; * Dashboard parameters are passed in with plain Field clause targets.
;;
;; One more thing to note: apparently `:expression`... is allowed below as well. I'm not sure how this is actually
;; supposed to work, but we have test #18747 that attempts to set it. I'm not convinced this should actually be
;; allowed.

;;; These are all legacy-style MBQL clauses FOR NOW, obviously at some point in the future we need to
;;; update [[metabase.lib.convert]] to convert `:parameters` back and forth and add UUIDs and what not. But parameters
;;; is not ported to MLv2 yet, so conversion isn't implemented YET.

(mr/def ::legacy-field-ref
  [:ref :metabase.legacy-mbql.schema/field])

(mr/def ::legacy-expression-ref
  [:ref :metabase.legacy-mbql.schema/expression])

(mr/def ::dimension.target
  [:multi {:dispatch lib.schema.common/mbql-clause-tag
           :error/fn (fn [{:keys [value]} _]
                       (str "Invalid :dimension target: must be either a :field or a :template-tag, got: "
                            (pr-str value)))}
   [:field        [:ref ::legacy-field-ref]]
   [:expression   [:ref ::legacy-expression-ref]]
   [:template-tag [:ref ::template-tag]]])

(mr/def ::dimension
  [:tuple
   #_tag    [:= {:decode/normalize lib.schema.common/normalize-keyword} :dimension]
   #_target [:ref ::dimension.target]])

;;; this is the reference like [:template-tag <whatever>], not the schema for native query template tags -- that lives
;;; in [[metabase.lib.schema.template-tag]]
(mr/def ::template-tag
  [:tuple
   #_tag      [:= {:decode/normalize lib.schema.common/normalize-keyword} :template-tag]
   #_tag-name [:multi {:dispatch map?}
               [true  [:map
                       [:id ::lib.schema.common/non-blank-string]]]
               [false ::lib.schema.common/non-blank-string]]])

(mr/def ::variable
  [:tuple
   #_tag    [:= {:decode/normalize lib.schema.common/normalize-keyword} :variable]
   #_target [:ref ::template-tag]])

(mr/def ::target
  [:multi {:dispatch lib.schema.common/mbql-clause-tag
           :error/fn (fn [{:keys [value]} _]
                       (str "Invalid parameter :target, must be either :field, :dimension, or :variable; got: "
                            (pr-str value)))}
   [:field     [:ref ::legacy-field-ref]]
   [:dimension [:ref ::dimension]]
   [:variable  [:ref ::variable]]])

(mr/def ::parameter
  [:map
   [:type [:ref ::type]]
   ;; TODO -- these definitely SHOULD NOT be optional but a ton of tests aren't passing them in like they should be.
   ;; At some point we need to go fix those tests and then make these keys required
   [:id       {:optional true} ::lib.schema.common/non-blank-string]
   [:target   {:optional true} [:ref ::target]]
   ;; not specified if the param has no value. TODO - make this stricter; type of `:value` should be validated based
   ;; on the [[ParameterType]]
   [:value    {:optional true} :any]
   ;; the name of the parameter we're trying to set -- this is actually required now I think, or at least needs to get
   ;; merged in appropriately
   [:name     {:optional true} ::lib.schema.common/non-blank-string]
   ;; The following are not used by the code in this namespace but may or may not be specified depending on what the
   ;; code that constructs the query params is doing. We can go ahead and ignore these when present.
   [:slug     {:optional true} ::lib.schema.common/non-blank-string]
   [:default  {:optional true} :any]
   [:required {:optional true} :any]])

(mr/def ::parameters
  [:sequential [:ref ::parameter]])
