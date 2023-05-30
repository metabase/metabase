import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import Collections from "metabase/entities/collections";
import Questions from "metabase/entities/questions";

import { Tooltip } from "metabase/core/components/Tooltip";

import TableInfoPopover from "metabase/components/MetadataInfo/TableInfoPopover";
import {
  isVirtualCardId,
  getQuestionIdFromVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";

import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";
import { TablesDivider } from "./QuestionDataSource.styled";

QuestionDataSource.propTypes = {
  question: PropTypes.object,
  originalQuestion: PropTypes.object,
  subHead: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
};

function isMaybeBasedOnDataset(question) {
  const tableId = question.query().sourceTableId();
  return isVirtualCardId(tableId);
}

function QuestionDataSource({ question, originalQuestion, subHead, ...props }) {
  if (!question) {
    return null;
  }

  const variant = subHead ? "subhead" : "head";

  if (!question.isStructured() || !isMaybeBasedOnDataset(question)) {
    return (
      <DataSourceCrumbs question={question} variant={variant} {...props} />
    );
  }

  const sourceTable = question.query().sourceTableId();
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTable);

  if (originalQuestion?.id() === sourceQuestionId) {
    return (
      <SourceDatasetBreadcrumbs
        model={originalQuestion}
        variant={variant}
        {...props}
      />
    );
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
                  variant={variant}
                  {...props}
                />
              );
            }
            return (
              <DataSourceCrumbs
                question={question}
                variant={variant}
                {...props}
              />
            );
          }}
        </Collections.Loader>
      )}
    </Questions.Loader>
  );
}

DataSourceCrumbs.propTypes = {
  question: PropTypes.object,
  variant: PropTypes.oneOf(["head", "subhead"]),
  isObjectDetail: PropTypes.bool,
};

function DataSourceCrumbs({ question, variant, isObjectDetail, ...props }) {
  const parts = getDataSourceParts({
    question,
    subHead: variant === "subhead",
    isObjectDetail,
  });
  return <HeadBreadcrumbs parts={parts} variant={variant} {...props} />;
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

QuestionDataSource.shouldRender = ({ question, isObjectDetail }) =>
  getDataSourceParts({ question, isObjectDetail }).length > 0;

function getDataSourceParts({ question, subHead, isObjectDetail }) {
  if (!question) {
    return [];
  }

  const isStructuredQuery = question.isStructured();
  const query = isStructuredQuery
    ? question.query().rootQuery()
    : question.query();

  const hasDataPermission = query.isEditable();
  if (!hasDataPermission) {
    return [];
  }

  const parts = [];

  const database = query.database();
  if (database) {
    parts.push({
      icon: !subHead ? "database" : undefined,
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
    const hasTableLink = subHead || isObjectDetail;
    if (!isStructuredQuery) {
      return {
        name: table.displayName(),
        link: hasTableLink ? getTableURL() : "",
      };
    }

    const allTables = [
      table,
      ...query.joins().map(j => j.joinedTable()),
    ].filter(Boolean);

    parts.push(
      <QuestionTableBadges
        tables={allTables}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />,
    );
  }

  return parts.filter(
    part => React.isValidElement(part) || part.name || part.icon,
  );
}

QuestionTableBadges.propTypes = {
  tables: PropTypes.arrayOf(PropTypes.object).isRequired,
  hasLink: PropTypes.bool,
  subHead: PropTypes.bool,
  isLast: PropTypes.bool,
};

function QuestionTableBadges({ tables, subHead, hasLink, isLast }) {
  const badgeInactiveColor = isLast && !subHead ? "text-dark" : "text-light";

  const parts = tables.map(table => (
    <HeadBreadcrumbs.Badge
      key={table.id}
      to={hasLink ? getTableURL(table) : ""}
      inactiveColor={badgeInactiveColor}
    >
      <TableInfoPopover table={table} placement="bottom-start">
        <span>{table.displayName()}</span>
      </TableInfoPopover>
    </HeadBreadcrumbs.Badge>
  ));

  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
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

export default QuestionDataSource;
