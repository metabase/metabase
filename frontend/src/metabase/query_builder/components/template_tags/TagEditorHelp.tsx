import { t, jt } from "ttag";
import Code from "metabase/components/Code";
import Button from "metabase/core/components/Button";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import Utils from "metabase/lib/utils";
import type { DatabaseId, NativeDatasetQuery } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

const SQL_EXAMPLES: Record<string, NativeDatasetQuery> = {
  variable: {
    database: null,
    type: "native",
    native: {
      query: "SELECT count(*)\nFROM products\nWHERE category = {{category}}",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "text",
          required: true,
          default: "Widget",
        },
      },
    },
  },
  dimension: {
    database: null,
    type: "native",
    native: {
      query: "SELECT count(*)\nFROM products\nWHERE {{created_at}}",
      "template-tags": {
        created_at: {
          id: Utils.uuid(),
          name: "created_at",
          "display-name": "Created At",
          type: "dimension",
          required: false,
        },
      },
    },
  },
  optional: {
    database: null,
    type: "native",
    native: {
      query:
        "SELECT count(*)\nFROM products\n[[WHERE category = {{category}}]]",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "text",
          required: false,
        },
      },
    },
  },
  multipleOptional: {
    database: null,
    type: "native",
    native: {
      query:
        "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND id = {{id}}]]\n  [[AND category = {{category}}]]",
      "template-tags": {
        id: {
          id: Utils.uuid(),
          name: "id",
          "display-name": "ID",
          type: "number",
          required: false,
        },
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "text",
          required: false,
        },
      },
    },
  },
  optionalDimension: {
    database: null,
    type: "native",
    native: {
      query:
        "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND {{category}}]]",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "dimension",
          required: false,
        },
      },
    },
  },
};

const MONGO_EXAMPLES: Record<string, NativeDatasetQuery> = {
  variable: {
    database: null,
    type: "native",
    native: {
      query: "[{ $match: { price: {{price}} } }]",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "price",
          "display-name": "Price",
          type: "number",
          required: true,
          default: "2",
        },
      },
    },
  },
  dimension: {
    database: null,
    type: "native",
    native: {
      query: "[{ $match: {{created_at}} }]",
      "template-tags": {
        created_at: {
          id: Utils.uuid(),
          name: "created_at",
          "display-name": "Created At",
          type: "dimension",
          required: false,
        },
      },
    },
  },
  optional: {
    database: null,
    type: "native",
    native: {
      query: "[{ $match: { [[ _id: {{id}} ]] } }]",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "id",
          "display-name": "ID",
          type: "text",
          required: false,
        },
      },
    },
  },
  multipleOptional: {
    database: null,
    type: "native",
    native: {
      query:
        "[{ $match: { [[ _id: {{id}} [[, category: {{category}} ]]  ]] } }]",
      "template-tags": {
        id: {
          id: Utils.uuid(),
          name: "id",
          "display-name": "ID",
          type: "number",
          required: false,
        },
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "text",
          required: false,
        },
      },
    },
  },
  optionalDimension: {
    database: null,
    type: "native",
    native: {
      query: "[{ $match: { $and: [ { _id: 1 } [[, {{category}} ]] ] } }]",
      "template-tags": {
        category: {
          id: Utils.uuid(),
          name: "category",
          "display-name": "Category",
          type: "dimension",
          required: false,
        },
      },
    },
  },
};

interface TagExampleProps {
  datasetQuery: NativeDatasetQuery;
  setDatasetQuery?: (datasetQuery: NativeDatasetQuery, run?: boolean) => void;
}

const TagExample = ({ datasetQuery, setDatasetQuery }: TagExampleProps) => (
  <div>
    <h5>{t`Example:`}</h5>
    <p>
      <Code>{datasetQuery.native.query}</Code>
      {setDatasetQuery && (
        <Button
          medium
          className="mt1"
          data-metabase-event="QueryBuilder;Template Tag Example Query Used"
          onClick={() => setDatasetQuery(datasetQuery, true)}
        >
          {t`Try it`}
        </Button>
      )}
    </p>
  </div>
);

interface TagEditorHelpProps {
  database?: Database | null;
  sampleDatabaseId: DatabaseId;
  setDatasetQuery: (datasetQuery: NativeDatasetQuery, run?: boolean) => void;
  switchToSettings: () => void;
}

export const TagEditorHelp = ({
  database,
  sampleDatabaseId,
  setDatasetQuery,
  switchToSettings,
}: TagEditorHelpProps) => {
  const engine = database?.engine;
  const examples = engine === "mongo" ? MONGO_EXAMPLES : SQL_EXAMPLES;
  const datasetId = engine === "mongo" ? database?.id : sampleDatabaseId;

  let setQueryWithDatasetId;

  if (datasetId != null) {
    setQueryWithDatasetId = (
      dataset_query: NativeDatasetQuery,
      run?: boolean,
    ) => {
      setDatasetQuery(
        {
          ...dataset_query,
          database: datasetId,
        },
        run,
      );
      switchToSettings();
    };
  }

  return (
    <div className="px3 text-spaced">
      <h4>{t`What's this for?`}</h4>
      <p>
        {t`Variables in native queries let you dynamically replace values in your queries using filter widgets or through the URL.`}
      </p>

      <h4 className="pt2">{t`Variables`}</h4>
      <p>
        {jt`${(
          <Code>{"{{variable_name}}"}</Code>
        )} creates a variable in this query template called "variable_name". Variables can be given types in the side panel, which changes their behavior. All variable types other than "Field Filter" will automatically cause a filter widget to be placed on this question; with Field Filters, this is optional. When this filter widget is filled in, that value replaces the variable in the query template.`}
      </p>
      <TagExample
        datasetQuery={examples.variable}
        setDatasetQuery={setQueryWithDatasetId}
      />

      <h4 className="pt2">{t`Field Filters`}</h4>
      <p>
        {t`Giving a variable the "Field Filter" type allows you to link questions to dashboard filter widgets or use more types of filter widgets on your SQL question. A Field Filter variable inserts SQL similar to that generated by the GUI query builder when adding filters on existing columns.`}
      </p>
      <p>
        {t`When adding a Field Filter variable, you'll need to map it to a specific field. You can then choose to display a filter widget on your question, but even if you don't, you can now map your Field Filter variable to a dashboard filter when adding this question to a dashboard. Field Filters should be used inside of a "WHERE" clause.`}
      </p>
      <TagExample
        datasetQuery={examples.dimension}
        setDatasetQuery={setQueryWithDatasetId}
      />

      <h4 className="pt2">{t`Optional Clauses`}</h4>
      <p>
        {jt`Brackets around a ${(
          <Code>{"[[{{variable}}]]"}</Code>
        )} create an optional clause in the template. If "variable" is set, then the entire clause is placed into the template. If not, then the entire clause is ignored.`}
      </p>
      <TagExample
        datasetQuery={examples.optional}
        setDatasetQuery={setQueryWithDatasetId}
      />

      <p>
        {t`To use multiple optional clauses you can include at least one non-optional WHERE clause followed by optional clauses starting with "AND".`}
      </p>
      <TagExample
        datasetQuery={examples.multipleOptional}
        setDatasetQuery={setQueryWithDatasetId}
      />

      <p>{t`When using a Field Filter, the column name should not be included in the SQL. Instead, the variable should be mapped to a field in the side panel.`}</p>
      <TagExample
        datasetQuery={examples.optionalDimension}
        setDatasetQuery={setQueryWithDatasetId}
      />

      <p className="pt2 link">
        <ExternalLink
          href={MetabaseSettings.docsUrl(
            "questions/native-editor/sql-parameters",
          )}
          target="_blank"
          data-metabase-event="QueryBuilder;Template Tag Documentation Click"
        >{t`Read the full documentation`}</ExternalLink>
      </p>
    </div>
  );
};
