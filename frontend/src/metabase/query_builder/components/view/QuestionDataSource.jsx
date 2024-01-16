import { isValidElement } from "react";
import { t } from "ttag";
import PropTypes from "prop-types";

import * as Lib from "metabase-lib";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Questions from "metabase/entities/questions";

import Tooltip from "metabase/core/components/Tooltip";

import TableInfoPopover from "metabase/components/MetadataInfo/TableInfoPopover";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/metadata/utils/saved-questions";

import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import { TablesDivider } from "./QuestionDataSource.styled";

QuestionDataSource.propTypes = {
  question: PropTypes.object,
  originalQuestion: PropTypes.object,
};

function isMaybeBasedOnDataset(question) {
  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  return isVirtualCardId(sourceTableId);
}

function QuestionDataSource({ question, originalQuestion, ...props }) {
  if (!question) {
    return null;
  }

  if (!question.isStructured() || !isMaybeBasedOnDataset(question)) {
    return <DataSourceCrumbs question={question} {...props} />;
  }

  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTableId);

  if (originalQuestion?.id() === sourceQuestionId) {
    return <SourceDatasetBreadcrumbs model={originalQuestion} {...props} />;
  }

  return (
    <Questions.Loader id={sourceQuestionId} loadingAndErrorWrapper={false}>
      {({ question: sourceQuestion }) => (
        <Collections.Loader
          id={sourceQuestion?.collectionId()}
          loadingAndErrorWrapper={false}
        >
          {({ collection, loading }) => {
            if (!sourceQuestion || loading) {
              return null;
            }
            if (sourceQuestion.isDataset()) {
              return (
                <SourceDatasetBreadcrumbs
                  model={sourceQuestion}
                  collection={collection}
                  {...props}
                />
              );
            }
            return <DataSourceCrumbs question={question} {...props} />;
          }}
        </Collections.Loader>
      )}
    </Questions.Loader>
  );
}

DataSourceCrumbs.propTypes = {
  question: PropTypes.object,
};

function DataSourceCrumbs({ question, ...props }) {
  const parts = getDataSourceParts({
    question,
  });
  return <HeadBreadcrumbs parts={parts} {...props} />;
}

SourceDatasetBreadcrumbs.propTypes = {
  model: PropTypes.object.isRequired,
  collection: PropTypes.object.isRequired,
};

function SourceDatasetBreadcrumbs({ model, collection, ...props }) {
  return (
    <HeadBreadcrumbs
      {...props}
      parts={[
        <HeadBreadcrumbs.Badge
          key="dataset-collection"
          to={Urls.collection(collection)}
          icon="model"
          inactiveColor="text-light"
        >
          {collection?.name || t`Our analytics`}
        </HeadBreadcrumbs.Badge>,
        model.isArchived() ? (
          <Tooltip
            key="dataset-name"
            tooltip={t`This model is archived and shouldn't be used.`}
            maxWidth="auto"
            placement="bottom"
          >
            <HeadBreadcrumbs.Badge
              inactiveColor="text-light"
              icon={{ name: "warning", color: color("danger") }}
            >
              {model.displayName()}
            </HeadBreadcrumbs.Badge>
          </Tooltip>
        ) : (
          <HeadBreadcrumbs.Badge
            to={Urls.question(model.card())}
            inactiveColor="text-light"
          >
            {model.displayName()}
          </HeadBreadcrumbs.Badge>
        ),
      ]}
    />
  );
}

QuestionDataSource.shouldRender = ({ question }) =>
  getDataSourceParts({ question }).length > 0;

function getDataSourceParts({ question }) {
  if (!question) {
    return [];
  }

  const isStructuredQuery = question.isStructured();
  const legacyQuery = isStructuredQuery
    ? question.legacyQuery({ useStructuredQuery: true }).rootQuery()
    : question.legacyQuery();

  const query = question.query();
  const { isEditable: hasDataPermission } = Lib.displayInfo(query, -1, query);

  if (!hasDataPermission) {
    return [];
  }

  const parts = [];

  const database = question.database();
  if (database) {
    parts.push({
      icon: "database",
      name: database.displayName(),
      href: database.id >= 0 && Urls.browseDatabase(database),
    });
  }

  const table = legacyQuery.table();
  if (table && table.hasSchema()) {
    const isBasedOnSavedQuestion = isVirtualCardId(table.id);
    if (!isBasedOnSavedQuestion) {
      parts.push({
        name: table.schema_name,
        href: database.id >= 0 && Urls.browseSchema(table),
      });
    }
  }

  if (table) {
    if (!isStructuredQuery) {
      return {
        name: table.displayName(),
      };
    }

    const allTables = [
      table,
      ...legacyQuery.joins().map(j => j.joinedTable()),
    ].filter(Boolean);

    parts.push(<QuestionTableBadges tables={allTables} />);
  }

  return parts.filter(part => isValidElement(part) || part.name || part.icon);
}

QuestionTableBadges.propTypes = {
  tables: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function QuestionTableBadges({ tables }) {
  const parts = tables.map(table => (
    <HeadBreadcrumbs.Badge key={table.id} to={""} inactiveColor="text-dark">
      <TableInfoPopover table={table} placement="bottom-start">
        <span>{table.displayName()}</span>
      </TableInfoPopover>
    </HeadBreadcrumbs.Badge>
  ));

  return (
    <HeadBreadcrumbs
      parts={parts}
      variant="head"
      divider={<TablesDivider>+</TablesDivider>}
      data-testid="question-table-badges"
    />
  );
}

export default QuestionDataSource;
