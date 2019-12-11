import React from "react";
import { t, jt } from "ttag";
import _ from "underscore";
import Code from "metabase/components/Code";
import MetabaseSettings from "metabase/lib/settings";

const SAMPLE_DATASET_EXAMPLES = {
  variable: {
    query: "SELECT count(*)\nFROM products\nWHERE category = {{category}}",
    "template-tags": {
      category: {
        name: "category",
        "display-name": "Category",
        type: "text",
        required: true,
        default: "Widget",
      },
    },
  },
  dimension: {
    query: "SELECT count(*)\nFROM products\nWHERE {{created_at}}",
    "template-tags": {
      created_at: {
        name: "created_at",
        "display-name": "Created At",
        type: "dimension",
        dimension: null,
        required: false,
      },
    },
  },
  optional: {
    query: "SELECT count(*)\nFROM products\n[[WHERE category = {{category}}]]",
    "template-tags": {
      category: {
        name: "category",
        "display-name": "Category",
        type: "text",
        required: false,
      },
    },
  },
  multipleOptional: {
    query:
      "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND id = {{id}}]]\n  [[AND category = {{category}}]]",
    "template-tags": {
      id: {
        name: "id",
        "display-name": "ID",
        type: "number",
        required: false,
      },
      category: {
        name: "category",
        "display-name": "Category",
        type: "text",
        required: false,
      },
    },
  },
  optionalDimension: {
    query: "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND {{category}}]]",
    "template-tags": {
      category: {
        name: "category",
        "display-name": "Category",
        type: "dimension",
        dimension: null,
        required: false,
      },
    },
  },
};

const MONGO_EXAMPLES = {
  variable: {
    collection: "Venues",
    query: '[{$match: {price: {{price}}}}]',
    "template-tags": {
      price: {
        name: "price",
        "display-name": "Price",
        type: "number",
        required: true,
        default: 2,
      },
    },
  },
  optional: {
    collection: "Venues",
    query: '[{$match: {[[price: {{price}}]]}}]',
    "template-tags": {
      price: {
        name: "price",
        "display-name": "Price",
        type: "number",
        required: false,
      },
    },
  },
  multipleOptional: {
    collection: "Venues",
    query:
      '[{$match: {[[price: {{price}}, [[category_id: {{category_id}}]]]]}}]',
    "template-tags": {
      price: {
        name: "price",
        "display-name": "Price",
        type: "number",
        required: false,
      },
      category_id: {
        name: "category_id",
        "display-name": "Category ID",
        type: "number",
        required: false,
      },
    },
  },
};

const TagExample = ({ datasetQuery, setDatasetQuery }) => (
  <div>
    <h5>Example:</h5>
    <Code>{datasetQuery.native.query}</Code>
    {setDatasetQuery && (
      <div
        className="Button Button--small mt1"
        data-metabase-event="QueryBuilder;Template Tag Example Query Used"
        onClick={() => setDatasetQuery(datasetQuery, true)}
      >
        {t`Try it`}
      </div>
    )}
  </div>
);

const exampleQuery = (driver, databaseId, exampleName) => {
  const examples =
    driver === "mongo" ? MONGO_EXAMPLES : SAMPLE_DATASET_EXAMPLES;
  const query = examples[exampleName];
  return (
    query && {
      database: databaseId,
      type: "native",
      native: query,
    }
  );
};

const TagEditorHelp = ({ database, setDatasetQuery, sampleDatasetId }) => {
  const driver = database && database.engine;
  const databaseId = driver === "mongo" ? database.id : sampleDatasetId;

  const setQuery =
    databaseId &&
    ((query, run) => {
      setDatasetQuery(query, run);
    });

  const supportsFieldFilters =
    database &&
    _.contains(database.features, "native-parameters-field-filters");

  const TryExample = ({ name }) => {
    const query = exampleQuery(driver, databaseId, name);
    return (
      query && <TagExample datasetQuery={query} setDatasetQuery={setQuery} />
    );
  };

  return (
    <div>
      <h4>{t`What's this for?`}</h4>
      <p>
        {t`Variables in native queries let you dynamically replace values in your queries using filter widgets or through the URL.`}
      </p>

      <h4 className="pt2">{t`Variables`}</h4>
      <p>
        {jt`${<Code>{"{{variable_name}}"}</Code>}
        creates a variable in this query template called "variable_name".
        Variables can be given types in the side panel, which change their behavior.`}
        {supportsFieldFilters && (
          <span>
            {t`All variable types other than "Field Filter" will automatically cause a filter widget to be placed on this question; with Field Filters, this is optional.`}
          </span>
        )}
        {t`When this filter widget is filled in, that value replaces the variable in the query template.`}
      </p>
      <TryExample name="variable" />

      {supportsFieldFilters && (
        <div>
          <h4 className="pt2">{t`Field Filters`}</h4>
          <p>
            {t`Giving a variable the "Field Filter" type allows you to link SQL cards to dashboard filter widgets or use more types of filter widgets on your SQL question. A Field Filter variable inserts SQL similar to that generated by the GUI query builder when adding filters on existing columns.`}
          </p>
          <p>
            {t`When adding a Field Filter variable, you'll need to map it to a specific field. You can then choose to display a filter widget on your question, but even if you don't, you can now map your Field Filter variable to a dashboard filter when adding this question to a dashboard. Field Filters should be used inside of a "WHERE" clause.`}
          </p>
          <TryExample name="dimension" />
        </div>
      )}

      <h4 className="pt2">{t`Optional Clauses`}</h4>
      <p>
        {jt`Brackets around a ${(
          <Code>{"[[{{variable}}]]"}</Code>
        )} create an optional clause in the template. If "variable" is set, then the entire clause is placed into the template. If not, then the entire clause is ignored.`}
      </p>
      <TryExample name="optional" />

      <p>
        {t`To use multiple optional clauses you can include at least one non-optional WHERE clause followed by optional clauses starting with "AND".`}
      </p>
      <TryExample name="multipleOptional" />

      {supportsFieldFilters && (
        <div>
          <p>{t`When using a Field Filter, the column name should not be included in the SQL. Instead, the variable should be mapped to a field in the side panel.`}</p>
          <TryExample name="optionalDimension" />
        </div>
      )}

      <p className="pt2 link">
        <a
          href={MetabaseSettings.docsUrl("users-guide/13-sql-parameters")}
          target="_blank"
          data-metabase-event="QueryBuilder;Template Tag Documentation Click"
        >{t`Read the full documentation`}</a>
      </p>
    </div>
  );
};

export default TagEditorHelp;
