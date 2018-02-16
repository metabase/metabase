import React from "react";
import { t, jt } from "c-3po";
import Code from "metabase/components/Code.jsx";

const EXAMPLES = {
  variable: {
    database: null,
    type: "native",
    native: {
      query: "SELECT count(*)\nFROM products\nWHERE category = {{category}}",
      template_tags: {
        category: {
          name: "category",
          display_name: "Category",
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
      template_tags: {
        created_at: {
          name: "created_at",
          display_name: "Created At",
          type: "dimension",
          dimension: null,
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
      template_tags: {
        category: {
          name: "category",
          display_name: "Category",
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
      template_tags: {
        id: { name: "id", display_name: "ID", type: "number", required: false },
        category: {
          name: "category",
          display_name: "Category",
          type: "text",
          required: false,
        },
      },
    },
  },
};

const TagExample = ({ datasetQuery, setDatasetQuery }) => (
  <div>
    <h5>Example:</h5>
    <p>
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
    </p>
  </div>
);

const TagEditorHelp = ({ setDatasetQuery, sampleDatasetId }) => {
  let setQueryWithSampleDatasetId = null;
  if (sampleDatasetId != null) {
    setQueryWithSampleDatasetId = (dataset_query, run) => {
      setDatasetQuery(
        {
          ...dataset_query,
          database: sampleDatasetId,
        },
        run,
      );
    };
  }
  return (
    <div>
      <h4>{t`What's this for?`}</h4>
      <p>
        {t`Variables in native queries let you dynamically replace values in your queries using filter widgets or through the URL.`}
      </p>

      <h4 className="pt2">{t`Variables`}</h4>
      <p>
        {jt`${(
          <Code>{"{{variable_name}}"}</Code>
        )} creates a variable in this SQL template called "variable_name". Variables can be given types in the side panel, which changes their behavior. All variable types other than "Field Filter" will automatically cause a filter widget to be placed on this question; with Field Filters, this is optional. When this filter widget is filled in, that value replaces the variable in the SQL template.`}
      </p>
      <TagExample
        datasetQuery={EXAMPLES.variable}
        setDatasetQuery={setQueryWithSampleDatasetId}
      />

      <h4 className="pt2">{t`Field Filters`}</h4>
      <p>
        {t`Giving a variable the "Field Filter" type allows you to link SQL cards to dashboard filter widgets or use more types of filter widgets on your SQL question. A Field Filter variable inserts SQL similar to that generated by the GUI query builder when adding filters on existing columns.`}
      </p>
      <p>
        {t`When adding a Field Filter variable, you'll need to map it to a specific field. You can then choose to display a filter widget on your question, but even if you don't, you can now map your Field Filter variable to a dashboard filter when adding this question to a dashboard. Field Filters should be used inside of a "WHERE" clause.`}
      </p>
      <TagExample datasetQuery={EXAMPLES.dimension} />

      <h4 className="pt2">{t`Optional Clauses`}</h4>
      <p>
        {jt`brackets around a ${(
          <Code>{"[[{{variable}}]]"}</Code>
        )} create an optional clause in the template. If "variable" is set, then the entire clause is placed into the template. If not, then the entire clause is ignored.`}
      </p>
      <TagExample
        datasetQuery={EXAMPLES.optional}
        setDatasetQuery={setQueryWithSampleDatasetId}
      />

      <p>
        {t`To use multiple optional clauses you can include at least one non-optional WHERE clause followed by optional clauses starting with "AND".`}
      </p>
      <TagExample
        datasetQuery={EXAMPLES.multipleOptional}
        setDatasetQuery={setQueryWithSampleDatasetId}
      />

      <p className="pt2 link">
        <a
          href="http://www.metabase.com/docs/latest/users-guide/start"
          target="_blank"
          data-metabase-event="QueryBuilder;Template Tag Documentation Click"
        >{t`Read the full documentation`}</a>
      </p>
    </div>
  );
};

export default TagEditorHelp;
