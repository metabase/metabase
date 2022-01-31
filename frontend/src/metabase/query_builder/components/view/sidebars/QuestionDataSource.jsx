import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";

import {
  isVirtualCardId,
  getQuestionIdFromVirtualTableId,
} from "metabase/lib/saved-questions";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";
import Questions from "metabase/entities/questions";
import Tooltip from "metabase/components/Tooltip";
import TableInfoPopover from "metabase/components/MetadataInfo/TableInfoPopover";

import {
  TablesDivider,
  Container,
  SourceBadge,
} from "./QuestionDataSource.styled";

function isMaybeBasedOnDataset(question) {
  const tableId = question.query().sourceTableId();
  return isVirtualCardId(tableId);
}

DataSourceCrumbs.propTypes = {
  question: PropTypes.object,
  isObjectDetail: PropTypes.bool,
};

function DataSourceCrumbs({ question, isObjectDetail, ...props }) {
  const parts = getDataSourceParts(question);
  return <DataSource parts={parts} {...props} />;
}

function getDataSourceParts(question) {
  if (!question) {
    return [];
  }

  const parts = [];

  const isStructuredQuery = question.isStructured();
  const query = isStructuredQuery
    ? question.query().rootQuery()
    : question.query();

  const database = query.database();
  if (database) {
    parts.push({
      icon: "database",
      name: database.displayName(),
      href: database.id >= 0 && Urls.browseDatabase(database),
    });
  }

  const table = query.table();
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
        icon: "table",
        name: table.displayName(),
        link: getTableURL(),
      };
    }

    const allTables = [
      table,
      ...query.joins().map(j => j.joinedTable()),
    ].filter(Boolean);

    parts.push(<QuestionTableBadges tables={allTables} hasLink={true} />);
  }

  return parts.filter(
    part => React.isValidElement(part) || part.name || part.icon,
  );
}

const crumbShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  icon: PropTypes.string,
  href: PropTypes.string,
});

const partPropType = PropTypes.oneOfType([crumbShape, PropTypes.node]);

DataSource.propTypes = {
  parts: PropTypes.arrayOf(partPropType).isRequired,
};

function DataSource({ parts, ...props }) {
  return (
    <Container {...props}>
      {parts.map((part, index) => {
        return (
          <React.Fragment key={index}>
            {React.isValidElement(part) ? (
              part
            ) : (
              <SourceBadge to={part.href} icon={part.icon}>
                {part.name}
              </SourceBadge>
            )}
          </React.Fragment>
        );
      })}
    </Container>
  );
}

QuestionTableBadges.propTypes = {
  tables: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function QuestionTableBadges({ tables }) {
  const parts = tables.map(table => (
    <SourceBadge key={table.id} to={getTableURL(table)} icon="table">
      <TableInfoPopover table={table} placement="bottom-start">
        <span className="text-medium">{table.displayName()}</span>
      </TableInfoPopover>
    </SourceBadge>
  ));

  return (
    <DataSource
      parts={parts}
      divider={<TablesDivider>+</TablesDivider>}
      data-testid="question-table-badges"
    />
  );
}

function getTableURL(table) {
  if (isVirtualCardId(table.id)) {
    const cardId = getQuestionIdFromVirtualTableId(table.id);
    return Urls.question({ id: cardId, name: table.displayName() });
  }
  return table.newQuestion().getUrl();
}

SourceDataset.propTypes = {
  dataset: PropTypes.object.isRequired,
};

function SourceDataset({ dataset, ...props }) {
  const { collection } = dataset;
  return (
    <DataSource
      {...props}
      parts={[
        <SourceBadge
          key="dataset-collection"
          to={Urls.collection(collection)}
          icon="folder"
        >
          {collection?.name || t`Our analytics`}
        </SourceBadge>,
        dataset.archived ? (
          <Tooltip
            key="dataset-name"
            tooltip={t`This model is archived and shouldn't be used.`}
            maxWidth="auto"
            placement="bottom"
          >
            <SourceBadge icon={{ name: "warning", color: color("danger") }}>
              {dataset.name}
            </SourceBadge>
          </Tooltip>
        ) : (
          <SourceBadge icon="model" to={Urls.question(dataset)}>
            {dataset.name}
          </SourceBadge>
        ),
      ]}
    />
  );
}

export default function QuestionSidebarDataSource({ question, ...props }) {
  if (!question) {
    return null;
  }

  if (!question.isStructured() || !isMaybeBasedOnDataset(question)) {
    return <DataSourceCrumbs question={question} {...props} />;
  }

  const sourceTable = question.query().sourceTableId();
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTable);

  return (
    <Questions.Loader id={sourceQuestionId} loadingAndErrorWrapper={false}>
      {({ question: sourceQuestion }) => {
        if (!sourceQuestion) {
          return null;
        }
        if (sourceQuestion.dataset) {
          return <SourceDataset dataset={sourceQuestion} {...props} />;
        }
        return <DataSourceCrumbs question={question} {...props} />;
      }}
    </Questions.Loader>
  );
}

QuestionSidebarDataSource.propTypes = {
  question: PropTypes.object,
  subHead: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
};

QuestionSidebarDataSource.shouldRender = ({ question }) =>
  !question.isDataset() && getDataSourceParts(question).length > 0;
