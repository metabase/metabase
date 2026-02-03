(ns metabase.lib.schema.parameter
  "`:parameters` specify the *values* of parameters previously defined for a Dashboard or Card (native query template
  tag parameters.) See [[metabase.lib.schema.template-tag]] above for more information on the later.

  There are three things called 'type' in play when we talk about parameters and template tags.

  Two are used when the parameters are specified/declared, in a [[TemplateTag]] or in a Dashboard parameter:

  1. Dashboard parameter/template tag `:type` -- `:dimension` (for a Field filter parameter),
     otherwise `:text`, `:number`, `:boolean`, or `:date`

  2. `:widget-type` -- only specified for Field filter parameters (where type is `:dimension`). This tells the FE
     what type of widget to display, and also tells us what types of parameters we should allow. Examples:
     `:date/all-options`, `:category`, etc.

  One type is used in the list (`:parameters`):

  3. Parameter `:type` -- specifies the type of the value being passed in. e.g. `:text` or `:string/!=`

  Note that some types that makes sense as widget types (e.g. `:date/all-options`) but not as actual value types are
  currently still allowed for backwards-compatibility purposes -- currently the FE client will just parrot back the
  `:widget-type` in some cases. In these cases, the backend is just supposed to infer the actual type of the parameter
  value."
  (:refer-clojure :exclude [get-in])
  (:require
   #?@(:clj
       ([flatland.ordered.map :as ordered-map]))
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [get-in]]))

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
  the [[metabase.query-processor.parameters.operators]] namespace for more information.

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
  (#?(:clj ordered-map/ordered-map :cljs hash-map) ; for REPL-friendliness
   ;; the basic raw-value types. These can be used with [[TemplateTag:RawValue]] template tags as well as
   ;; [[TemplateTag:FieldFilter]] template tags.
   :number  {:type :numeric, :allowed-for #{:number :number/= :id :category :location/zip_code}}
   :text    {:type :string,  :allowed-for #{:text :string/= :id :category
                                            :location/city :location/state :location/zip_code :location/country}}
   :date    {:type :date,    :allowed-for #{:date :date/single :date/all-options :id :category}}
   :boolean {:type :boolean, :allowed-for #{:boolean :id :category :boolean/=}}

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
   ;; [[metabase.public-sharing-rest.api-test/execute-public-card-with-parameters-test]]
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
   :location/zip_code {:allowed-for #{:location/zip_code}} ; TODO (Cam 8/12/25) -- should use `kebab-case` like literally every other type
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
   :number/<=               {:type :numeric, :operator :unary, :allowed-for #{:number/<= :number/between}}
   :number/=                {:type :numeric, :operator :variadic, :allowed-for #{:number/= :number :id :category
                                                                                 :location/zip_code}}
   :number/>=               {:type :numeric, :operator :unary, :allowed-for #{:number/>= :number/between}}
   :number/between          {:type :numeric, :operator :binary, :allowed-for #{:number/between}}
   :string/!=               {:type :string, :operator :variadic, :allowed-for #{:string/!=}}
   :string/=                {:type :string, :operator :variadic, :allowed-for #{:string/= :text :id :category
                                                                                :location/city :location/state
                                                                                :location/zip_code :location/country}}
   :string/contains         {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/contains}}
   :string/does-not-contain {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/does-not-contain}}
   :string/ends-with        {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/ends-with}}
   :string/starts-with      {:type :string, :operator :variadic, :options-fn variadic-opts-first, :allowed-for #{:string/starts-with}}
   :boolean/=               {:type :boolean, :operator :variadic, :allowed-for #{:boolean :boolean/=}}))

(mr/def ::type
  "Valid parameter :type"
  (into [:enum {:default          :text
                :error/message    "valid parameter type"
                :decode/normalize (fn [param-type]
                                    ;; a lot of broken code in Actions was setting param types to invalid things like
                                    ;; `:type/Text`... fix it
                                    (when-let [param-type (lib.schema.common/normalize-keyword param-type)]
                                      (cond
                                        (= (namespace param-type) "type") (keyword (u/lower-case-en (name param-type)))
                                        (= param-type :category/=)        :category
                                        :else                             param-type)))}]
        (keys types)))

(def ^:private valid-widget-types (set (keys types)))

(defn- normalize-widget-type [x]
  (when-let [x (lib.schema.common/normalize-keyword x)]
    (cond
      (valid-widget-types x)
      x

      ;; for invalid namespaced types like `:category/=` return closest unnamespaced match e.g. `:category`
      (and (qualified-keyword? x)
           (valid-widget-types (keyword (namespace x))))
      (keyword (namespace x))

      ;; if no close match return `:none`
      :else
      :none)))

(mr/def ::widget-type
  "The type of widget to display in the FE UI for the user to use to pick values for this parameter."
  (into [:enum
         {:error/message    "valid parameter widget type"
          :decode/normalize normalize-widget-type}
         :none]
        (keys types)))

(mu/defn parameter-type-and-widget-type-allowed-together?
  "Whether `parameter-type` (the `:type` of the value in an MBQL query `:parameters` list, e.g. `:text`) and
  `widget-type` (the declared type of the parameter in the Card/Dashboard definition, e.g. `:number`) are compatible."
  [parameter-type :- ::type
   widget-type    :- ::widget-type]
  (when-let [allowed-template-tag-types (get-in types [parameter-type :allowed-for])]
    (contains? allowed-template-tag-types widget-type)))

(mu/defn allowed-parameter-types-for-template-tag-widget-type :- [:set ::type]
  "Set of allowed parameter types for a given `:widget-type`."
  [widget-type :- ::widget-type]
  (into #{} (for [[parameter-type {:keys [allowed-for]}] types
                  :when                                  (contains? allowed-for widget-type)]
              parameter-type)))

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

(mr/def ::target.legacy-field-ref
  [:ref :metabase.legacy-mbql.schema/field])

(mr/def ::target.legacy-expression-ref
  [:ref :metabase.legacy-mbql.schema/expression])

(mr/def ::dimension.target
  [:multi {:dispatch lib.schema.common/mbql-clause-tag
           :error/fn (fn [{:keys [value]} _]
                       (str "Invalid :dimension target: must be a :field, :template-tag, or :expression, got: "
                            (pr-str value)))}
   [:expression   [:ref ::target.legacy-expression-ref]]
   [:template-tag [:ref ::template-tag]]
   ;; other stuff like MBQL 3 `:fk->` and `:field-id` need to get converted to MBQL 4 `:field`
   [::mc/default  [:ref ::target.legacy-field-ref]]])

;;; TODO (Cam 8/8/25) -- is options supposed to be non-empty? It it supposed to be removed from `:dimension` if it's
;;; empty? Unclear. I don't think it matters tho.
(mr/def ::dimension.options
  [:map
   {:error/message "dimension options"}
   [:stage-number {:optional true} :int]])

;;; TODO (Cam 8/8/25) -- seems really WACK to have dimension use MBQL 4 clause order even in Lib... I guess it's not a
;;; real MBQL clause tho.
(mr/def ::dimension
  [:catn
   ;; this `:decode/normalize` function seems unnecessary but it improves the errors a lot: without it we won't
   ;; normalize the tag if the target or options are invalid:
   ;;
   ;; without:
   ;;
   ;;    (metabase.lib.core/normalize ::target ["dimension" ["template-tags" "category"]])
   ;;    ;; WARN lib.normalize :: Error normalizing MBQL 5: [["should be :dimension"]]
   ;;    {:value ["dimension" ["template-tags" "category"]], :schema :metabase.lib.schema.parameter/target}
   ;;
   ;; with:
   ;;
   ;;    ;; WARN lib.normalize :: Error normalizing MBQL 5: [nil ["Invalid :dimension target: must be a :field, :template-tag, or :expression, got: [\"template-tags\" \"category\"]"]]
   ;;    {:value [:dimension ["template-tags" "category"]], :schema :metabase.lib.schema.parameter/target}
   {:decode/normalize (fn [dimension]
                        (if (and (sequential? dimension)
                                 (string? (first dimension)))
                          (update (vec dimension) 0 keyword)
                          dimension))}
   [:tag     [:= {:decode/normalize lib.schema.common/normalize-keyword} :dimension]]
   [:target  ::dimension.target]
   [:options [:? [:maybe ::dimension.options]]]])

(mr/def ::template-tag.tag-name
  [:multi {:dispatch map?}
   [true  [:map
           [:id ::lib.schema.common/non-blank-string]]]
   [false [:schema
           {:decode/normalize (fn [x]
                                (cond-> x
                                  (keyword? x) u/qualified-name))}
           ::lib.schema.common/non-blank-string]]])

(mr/def ::template-tag
  "This is the reference like [:template-tag <whatever>], not the schema for native query template tags -- that lives
  in [[metabase.lib.schema.template-tag]]."
  [:tuple
   #_tag      [:= {:decode/normalize lib.schema.common/normalize-keyword} :template-tag]
   #_tag-name ::template-tag.tag-name])

(mr/def ::variable.target
  [:multi {:dispatch      lib.schema.common/mbql-clause-tag
           :error/message "A :variable target must be a (legacy) :field or :template-tag"
           :error/fn      (fn [{:keys [value]} _]
                            (str "Invalid :variable target: must be a :field or :template-tag, got: " (pr-str value)))}
   [:field        [:ref ::target.legacy-field-ref]]
   [:template-tag [:ref ::template-tag]]])

(mr/def ::variable
  [:tuple
   #_tag    [:= {:decode/normalize lib.schema.common/normalize-keyword} :variable]
   #_target [:ref ::variable.target]])

(mr/def ::text-tag
  "A :text-tag parameter :target applies to parameterized text cards in viz settings"
  [:tuple
   [:= {:decode/normalize lib.schema.common/normalize-keyword} :text-tag]
   :string])

(mr/def ::target
  [:multi {:dispatch (fn [x]
                       (if (pos-int? x)
                         :field
                         (let [tag (lib.schema.common/mbql-clause-tag x)]
                           ;; MBQL 3 refs like `:field-id` should get normalized to `:field`
                           (case tag
                             (:field-id :field-literal :fk->) :field
                             tag))))
           :error/fn (fn [{:keys [value]} _]
                       (str "Invalid parameter :target, must be either :field, :dimension, :variable, or :text-tag; got: "
                            (pr-str value)))
           ;; you're not allowed to have a `:template-tag` here unless it's wrapped in `:variable` or `:dimension`...
           ;; not sure which one is supposed to be correct TBH
           :decode/normalize (fn [x]
                               (if (= (lib.schema.common/mbql-clause-tag x) :template-tag)
                                 [:variable x]
                                 x))}
   ;; TODO (Cam 9/12/25) -- the old legacy MBQL schema also said `:expression` refs where allowed here, but I don't
   ;; know if we actually did allow that in practice.
   [:dimension [:ref ::dimension]]
   [:variable  [:ref ::variable]]
   [:text-tag  [:ref ::text-tag]]
   [:field     [:ref ::target.legacy-field-ref]]])

(defn- normalize-parameter
  [param]
  (when (map? param)
    (let [param (lib.schema.common/normalize-map param)]
      (case (keyword (:type param))
        :number/between
        (let [[l u] (:value param)]
          (cond-> param
            (nil? u) (assoc :type :number/>=, :value [l])
            (nil? l) (assoc :type :number/<=, :value [u])))
        param))))

(mr/def ::id
  [:schema
   {:api/regex lib.schema.common/url-encoded-string-regex}
   [:ref ::lib.schema.common/non-blank-string]])

(defn- sort-parameter-values
  "Return the sequence of parameter maps, but with any :value keys sorted if they are a sequence. Parameter values can
  be of mixed types, as bigintegers are passed as strings to avoid precision loss."
  [param-value]
  (if (sequential? param-value)
    (vec (sort-by str param-value))
    param-value))

(mr/def ::parameter.value
  [:schema
   {:encode/for-hashing #'sort-parameter-values}
   :any])

(mr/def ::parameter
  "Schema for the *value* of a parameter (e.g. a Dashboard parameter or a native query template tag) as passed in as
  part of the `:parameters` list in a query.

  Note that this is different from the parameter declarations that are saved as part of Dashboards and Cards; for THAT
  schema refer to `:metabase.parameters.schema/parameter`."
  [:and
   [:map
    {:decode/normalize #'normalize-parameter}
    [:type [:ref ::type]]
    ;; TODO -- these definitely SHOULD NOT be optional but a ton of tests aren't passing them in like they should be.
    ;; At some point we need to go fix those tests and then make these keys required
    [:id       {:optional true} [:ref ::id]]
    [:target   {:optional true} [:ref ::target]]
    ;; not specified if the param has no value. TODO - make this stricter; type of `:value` should be validated based
    ;; on the `::type`
    [:value    {:optional true} [:ref ::parameter.value]]
    ;; the name of the parameter we're trying to set -- this is actually required now I think, or at least needs to get
    ;; merged in appropriately
    [:name     {:optional true} ::lib.schema.common/non-blank-string]
    ;; The following are not used by the code in this namespace but may or may not be specified depending on what the
    ;; code that constructs the query params is doing. We can go ahead and ignore these when present.
    [:slug     {:optional true} ::lib.schema.common/non-blank-string]
    [:default  {:optional true} :any]
    [:required {:optional true} :any]]
   ::lib.schema.common/kebab-cased-map
   (lib.schema.common/disallowed-keys
    {:dimension ":dimension is not allowed in a parameter, you probably meant to use :target [:dimension ...] instead."})])

(defn- encode-parameters-for-hashing [parameters]
  (vec (sort-by (some-fn :id (constantly "")) parameters)))

(mr/def ::parameters
  "Schema for a list of `:parameters` as passed in to a query."
  [:sequential
   {:encode/for-hashing #'encode-parameters-for-hashing}
   [:ref ::parameter]])
