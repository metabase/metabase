import PropTypes from "prop-types";
import { isValidElement } from "react";
import { t } from "ttag";

import { TableInfoIcon } from "metabase/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import Tooltip from "metabase/core/components/Tooltip";
import Collections from "metabase/entities/collections";
import Questions from "metabase/entities/questions";
import { color } from "metabase/lib/colors";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import {
  isVirtualCardId,
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";

import { TablesDivider, IconWrapper } from "./QuestionDataSource.styled";

QuestionDataSource.propTypes = {
  question: PropTypes.object,
  originalQuestion: PropTypes.object,
  subHead: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
};

function isMaybeBasedOnDataset(question) {
  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  return isVirtualCardId(sourceTableId);
}

export function QuestionDataSource({
  question,
  originalQuestion,
  subHead,
  ...props
}) {
  if (!question) {
    return null;
  }

  const variant = subHead ? "subhead" : "head";

  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (isNative || !isMaybeBasedOnDataset(question)) {
    return (
      <DataSourceCrumbs question={question} variant={variant} {...props} />
    );
  }

  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTableId);

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
            if (sourceQuestion.type() === "model") {
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

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hasDataPermission = isEditable;
  if (!hasDataPermission) {
    return [];
  }

  const parts = [];
  const query = question.query();
  const metadata = question.metadata();
  const { isNative } = Lib.queryDisplayInfo(query);

  const database = metadata.database(Lib.databaseID(query));
  if (database) {
    parts.push({
      icon: !subHead ? "database" : undefined,
      name: database.displayName(),
      href: database.id >= 0 && Urls.browseDatabase(database),
    });
  }

  const table = !isNative
    ? metadata.table(Lib.sourceTableOrCardId(query))
    : question.legacyQuery().table();
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
    if (isNative) {
      return {
        name: table.displayName(),
        link: hasTableLink ? getTableURL() : "",
      };
    }

    const allTables = [
      table,
      ...Lib.joins(query, -1)
        .map(join => Lib.pickerInfo(query, Lib.joinedThing(query, join)))
        .map(pickerInfo => {
          if (pickerInfo?.tableId != null) {
            return metadata.table(pickerInfo.tableId);
          }

          if (pickerInfo?.cardId != null) {
            return metadata.table(getQuestionVirtualTableId(pickerInfo.cardId));
          }

          return undefined;
        }),
    ].filter(isNotNull);

    parts.push(
      <QuestionTableBadges
        tables={allTables}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />,
    );
  }

  return parts.filter(part => isValidElement(part) || part.name || part.icon);
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
      <span>
        {table.displayName()}
        {!subHead && (
          <IconWrapper>
            <TableInfoIcon
              table={table}
              icon="info_filled"
              size={12}
              position="bottom"
            />
          </IconWrapper>
        )}
      </span>
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
  return ML_Urls.getUrl(table.newQuestion());
}
