(ns i18n.create-artifacts.test-common)

(def ^:private singular-message-frontend
  {:id                "No table description yet"
   :id-plural         nil
   :str               "No hay una descripción de la tabla"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["frontend/src/metabase/admin/datamodel/components/database/MetadataTable.jsx:136"]
   :context           nil})

(def ^:private singular-message-backend
  {:id                "No table description yet"
   :id-plural         nil
   :str               "No hay una descripción de la tabla"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["metabase/warehouse_schema/models/table.clj"]
   :context           nil})

(def ^:private singular-template-message-frontend
  {:id                "Count of {0}"
   :id-plural         nil
   :str               "Número de {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["frontend/src/metabase/reference/databases/TableDetail.jsx:38"]
   :context           nil})

(def ^:private singular-template-message-backend
  {:id                "Count of {0}"
   :id-plural         nil
   :str               "Número de {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["src/metabase/warehouse_schema/models/table.clj:80"]
   :context           nil})

(def ^:private plural-message-frontend
  {:id                "{0} Queryable Table"
   :id-plural         "{0} Queryable Tables"
   :str               nil
   :str-plural        ["{0} Tabla Consultable" "{0} Tablas consultables"]
   :fuzzy?            false
   :plural?           true
   :source-references ["frontend/src/metabase/admin/datamodel/components/database/MetadataTableList.jsx:77"]
   :context           nil})

(def ^:private plural-message-backend
  {:id               "{0} table"
   :id-plural        "{0} tables"
   :str               nil
   :str-plural        ["{0} tabla" "{0} tablas"]
   :fuzzy?            false
   :plural?           true
   :source-references ["src/metabase/automagic_dashboards/core.clj"]
   :context           nil})

(def ^:private plural-message-frontend-with-empty
  {:id                "{0} metric"
   :id-plural         "{0} metrics"
   :str               nil
   :str-plural        ["{0} metrik" ""]
   :fuzzy?            false
   :plural?           true
   :source-references ["frontend/src/metabase/query_builder/components/view/QuestionDescription.jsx:20"]
   :context           nil})

(def ^:private plural-message-backend-with-empty
  {:id                "{0} metric"
   :id-plural         "{0} metrics"
   :str               nil
   :str-plural        ["{0} metrik" ""]
   :fuzzy?            false
   :plural?           true
   :source-references ["src/metabase/automagic_dashboards/core.clj"]
   :context           nil})

(def ^:private cljc-message
  {:id                "Average of {0}"
   :id-plural         nil
   :str               "Average of {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["src/metabase/utils/aggregation.cljc"]
   :context           nil})

(def ^:private cljs-message
  {:id                "Median of {0}"
   :id-plural         nil
   :str               "Median of {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["src/metabase/utils/aggregation.cljs"]
   :context           nil})

;; The same `msgid` under two different contexts — a pluralized unit and a granularity option.
;; They are separate messages, and collapsing them onto one entry loses a translation.
(def ^:private plural-message-frontend-no-context
  {:id                "Year"
   :id-plural         "Years"
   :str               nil
   :str-plural        ["Año" "Años"]
   :fuzzy?            false
   :plural?           true
   :source-references ["frontend/src/metabase/querying/utils.ts:41"]
   :context           nil})

(def ^:private singular-message-frontend-with-context
  {:id                "Year"
   :id-plural         nil
   :str               "Año"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["frontend/src/metabase/visualizations/SmartScalar/definition.ts:127"]
   :context           "Date granularity option, distinct from the pluralized unit"})

(def ^:private messages
  [singular-message-frontend
   singular-message-backend
   singular-template-message-frontend
   singular-template-message-backend
   plural-message-frontend
   plural-message-frontend-with-empty
   plural-message-backend
   plural-message-backend-with-empty
   cljc-message
   cljs-message
   plural-message-frontend-no-context
   singular-message-frontend-with-context])

(def po-contents
  "Contents of a `.po` file."
  {:headers  {"MIME-Version"              "1.0",
              "Content-Type"              "text/plain; charset=UTF-8",
              "Content-Transfer-Encoding" "8bit",
              "X-Generator"               "POEditor.com",
              "Project-Id-Version"        "Metabase",
              "Language"                  "es",
              "Plural-Forms"              "nplurals=2; plural=(n != 1);"}
   :messages messages})
