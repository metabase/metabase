import cx from "classnames";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useMetadataProvider } from "metabase/metadata-store";
import { Box, Button, Code } from "metabase/ui";
import { uuid } from "metabase/utils/uuid";
import * as Lib from "metabase-lib";
import type { DatabaseId, TemplateTag } from "metabase-types/api";

type QueryExample = {
  query: string;
  templateTags: TemplateTag[];
};

const SQL_EXAMPLES: Record<string, QueryExample> = {
  variable: {
    query: "SELECT count(*)\nFROM products\nWHERE category = {{category}}",
    templateTags: [
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "text",
        required: true,
        default: "Widget",
      },
    ],
  },
  dimension: {
    query: "SELECT count(*)\nFROM products\nWHERE {{created_at}}",
    templateTags: [
      {
        id: uuid(),
        name: "created_at",
        "display-name": "Created At",
        type: "dimension",
        required: false,
      },
    ],
  },
  optional: {
    query: "SELECT count(*)\nFROM products\n[[WHERE category = {{category}}]]",
    templateTags: [
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "text",
        required: false,
      },
    ],
  },
  multipleOptional: {
    query:
      "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND id = {{id}}]]\n  [[AND category = {{category}}]]",
    templateTags: [
      {
        id: uuid(),
        name: "id",
        "display-name": "ID",
        type: "number",
        required: false,
      },
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "text",
        required: false,
      },
    ],
  },
  optionalDimension: {
    query: "SELECT count(*)\nFROM products\nWHERE 1=1\n  [[AND {{category}}]]",
    templateTags: [
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "dimension",
        required: false,
      },
    ],
  },
};

const MONGO_EXAMPLES: Record<string, QueryExample> = {
  variable: {
    query: "[{ $match: { price: {{price}} } }]",
    templateTags: [
      {
        id: uuid(),
        name: "price",
        "display-name": "Price",
        type: "number",
        required: true,
        default: "2",
      },
    ],
  },
  dimension: {
    query: "[{ $match: {{created_at}} }]",
    templateTags: [
      {
        id: uuid(),
        name: "created_at",
        "display-name": "Created At",
        type: "dimension",
        required: false,
      },
    ],
  },
  optional: {
    query: "[{ $match: { [[ _id: {{id}} ]] } }]",
    templateTags: [
      {
        id: uuid(),
        name: "id",
        "display-name": "ID",
        type: "text",
        required: false,
      },
    ],
  },
  multipleOptional: {
    query: "[{ $match: { [[ _id: {{id}} [[, category: {{category}} ]]  ]] } }]",
    templateTags: [
      {
        id: uuid(),
        name: "id",
        "display-name": "ID",
        type: "number",
        required: false,
      },
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "text",
        required: false,
      },
    ],
  },
  optionalDimension: {
    query: "[{ $match: { $and: [ { _id: 1 } [[, {{category}} ]] ] } }]",
    templateTags: [
      {
        id: uuid(),
        name: "category",
        "display-name": "Category",
        type: "dimension",
        required: false,
      },
    ],
  },
};

interface TagExampleProps {
  example: QueryExample;
  onTry?: (example: QueryExample) => void;
}

const TagExample = ({ example, onTry }: TagExampleProps) => (
  <div>
    <h5>{t`Example:`}</h5>
    <Box py="sm">
      <Code block>{example.query}</Code>
      {onTry && (
        <Button className={CS.mt1} onClick={() => onTry(example)}>
          {t`Try it`}
        </Button>
      )}
    </Box>
  </div>
);

interface TagEditorHelpProps {
  databaseId: DatabaseId | null;
  databaseEngine: string | null | undefined;
  sampleDatabaseId?: DatabaseId;
  setQuery: (query: Lib.Query) => void;
  switchToSettings: () => void;
}

export const TagEditorHelp = ({
  databaseId,
  databaseEngine,
  sampleDatabaseId,
  setQuery,
  switchToSettings,
}: TagEditorHelpProps) => {
  const examples = databaseEngine === "mongo" ? MONGO_EXAMPLES : SQL_EXAMPLES;
  const datasetId = databaseEngine === "mongo" ? databaseId : sampleDatabaseId;

  const metadataProvider = useMetadataProvider(datasetId ?? null);

  const handleTryExample =
    datasetId != null
      ? (example: QueryExample) => {
          const query = Lib.withTemplateTags(
            Lib.nativeQuery(datasetId, metadataProvider, example.query),
            example.templateTags,
          );
          setQuery(query);
          switchToSettings();
        }
      : undefined;

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "questions/native-editor/sql-parameters",
  );

  return (
    <div className={CS.textSpaced}>
      <h4>{t`What's this for?`}</h4>
      <p>
        {t`Variables in native queries let you dynamically replace values in your queries using filter widgets or through the URL.`}
      </p>

      <h4 className={CS.pt2}>{t`Variables`}</h4>
      <p>
        {jt`${(
          <Code key="code">{"{{variable_name}}"}</Code>
        )} creates a variable in this query template called "variable_name". Variables can be given types in the side panel, which changes their behavior. All variable types other than "Field Filter" will automatically cause a filter widget to be placed on this question; with Field Filters, this is optional. When this filter widget is filled in, that value replaces the variable in the query template.`}
      </p>
      <TagExample example={examples.variable} onTry={handleTryExample} />

      <h4 className={CS.pt2}>{t`Field Filters`}</h4>
      <p>
        {t`Giving a variable the "Field Filter" type allows you to link questions to dashboard filter widgets or use more types of filter widgets on your SQL question. A Field Filter variable inserts SQL similar to that generated by the GUI query builder when adding filters on existing columns.`}
      </p>
      <p>
        {t`When adding a Field Filter variable, you'll need to map it to a specific field. You can then choose to display a filter widget on your question, but even if you don't, you can now map your Field Filter variable to a dashboard filter when adding this question to a dashboard. Field Filters should be used inside of a "WHERE" clause.`}
      </p>
      <TagExample example={examples.dimension} onTry={handleTryExample} />

      <h4 className={CS.pt2}>{t`Optional Clauses`}</h4>
      <p>
        {jt`Brackets around a ${(
          <Code key="code">{"[[{{variable}}]]"}</Code>
        )} create an optional clause in the template. If "variable" is set, then the entire clause is placed into the template. If not, then the entire clause is ignored.`}
      </p>
      <TagExample example={examples.optional} onTry={handleTryExample} />

      <p>
        {t`To use multiple optional clauses you can include at least one non-optional WHERE clause followed by optional clauses starting with "AND".`}
      </p>
      <TagExample
        example={examples.multipleOptional}
        onTry={handleTryExample}
      />

      <p>{t`When using a Field Filter, the column name should not be included in the SQL. Instead, the variable should be mapped to a field in the side panel.`}</p>
      <TagExample
        example={examples.optionalDimension}
        onTry={handleTryExample}
      />

      {showMetabaseLinks && (
        <p className={cx(CS.pt2, CS.link)}>
          <ExternalLink
            href={docsUrl}
            target="_blank"
          >{t`Read the full documentation`}</ExternalLink>
        </p>
      )}
    </div>
  );
};
