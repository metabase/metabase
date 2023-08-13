(ns metabase.lib.schema.parameter
  "`:parameters` specify the *values* of parameters previously definied for a Dashboard or Card (native query template
  tag parameters.) See [[metabase.lib.schema.template-tag]] above for more information on the later.

  There are three things called 'type' in play when we talk about parameters and template tags.

  Two are used when the parameters are specified/declared, in a Template Tag or in a Dashboard parameter:

  1. Dashboard parameter/template tag `:type` -- `:dimension` (for a Field filter parameter), otherwise `:text`,
     `:number`, `:boolean`, or `:date`

  2. `:widget-type` -- only specified for Field filter parameters (where type is `:dimension`). This tells the FE what
     type of widget to display, and also tells us what types of parameters we should allow. Examples:
     `:date/all-options`, `:category`, etc.

     One type is used in the Parameter list (`:parameters`):

  3. Parameter `:type` -- specifies the type of the value being passed in. e.g. `:text` or `:string/!=`

  Note that some types that makes sense as widget types (e.g. `:date/all-options`) but not as actual value types are
  currently still allowed for backwards-compatibility purposes -- currently the FE client will just parrot back the
  `:widget-type` in some cases. In these cases, the backend is just supposed to infer the actual type of the parameter
  value."
  (:require [metabase.util.malli.registry :as mr]))

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
  lock the results down to a single row or set of rows."
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
   :string/contains         {:type :string, :operator :unary, :allowed-for #{:string/contains}}
   :string/does-not-contain {:type :string, :operator :unary, :allowed-for #{:string/does-not-contain}}
   :string/ends-with        {:type :string, :operator :unary, :allowed-for #{:string/ends-with}}
   :string/starts-with      {:type :string, :operator :unary, :allowed-for #{:string/starts-with}}})

(mr/def ::type
  (into [:enum] (keys types)))
