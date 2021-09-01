(ns i18n.create-artifacts.test-common)

(def singular-message-frontend
  {:id                "No table description yet"
   :id-plural         nil
   :str               "No hay una descripción de la tabla"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["frontend/src/metabase/admin/datamodel/components/database/MetadataTable.jsx:136"]
   :comment           nil})

(def singular-message-backend
  {:id                "No table description yet"
   :id-plural         nil
   :str               "No hay una descripción de la tabla"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["src/metabase/models/table.clj"]
   :comment           nil})

(def singular-template-message-frontend
  {:id                "Count of {0}"
   :id-plural         nil
   :str               "Número de {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["frontend/src/metabase/reference/databases/TableDetail.jsx:38"]
   :comment           nil})

(def singular-template-message-backend
  {:id                "Count of {0}"
   :id-plural         nil
   :str               "Número de {0}"
   :str-plural        nil
   :fuzzy?            false
   :plural?           false
   :source-references ["src/metabase/models/table.clj"]
   :comment           nil})

(def plural-message-frontend
  {:id                "{0} Queryable Table"
   :id-plural         "{0} Queryable Tables"
   :str               nil
   :str-plural        ["{0} Tabla Consultable" "{0} Tablas consultables"]
   :fuzzy?            false
   :plural?           true
   :source-references ["frontend/src/metabase/admin/datamodel/components/database/MetadataTableList.jsx:77"]
   :comment           nil})

(def messages
  [singular-message-frontend
   singular-message-backend
   singular-template-message-frontend
   singular-template-message-backend
   plural-message-frontend])

(def po-contents
  {:headers  {"MIME-Version"              "1.0",
              "Content-Type"              "text/plain; charset=UTF-8",
              "Content-Transfer-Encoding" "8bit",
              "X-Generator"               "POEditor.com",
              "Project-Id-Version"        "Metabase",
              "Language"                  "es",
              "Plural-Forms"              "nplurals=2; plural=(n != 1);"}
   :messages messages})
