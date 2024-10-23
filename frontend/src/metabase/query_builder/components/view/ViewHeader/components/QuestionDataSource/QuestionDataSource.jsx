import PropTypes from "prop-types";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import Tooltip from "metabase/core/components/Tooltip";
import Questions from "metabase/entities/questions";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";

import { getDataSourceParts, getQuestionIcon } from "./utils";

QuestionDataSource.propTypes = {
  question: PropTypes.object,
  originalQuestion: PropTypes.object,
  subHead: PropTypes.bool,
  isObjectDetail: PropTypes.bool,
};

export function QuestionDataSource({
  question,
  originalQuestion,
  subHead = false,
  ...props
}) {
  if (!question) {
    return null;
  }

  const query = question.query();
  const sourceTableId = Lib.sourceTableOrCardId(query);

  const { isNative } = Lib.queryDisplayInfo(query);
  const sourceQuestionId = getQuestionIdFromVirtualTableId(sourceTableId);

  const variant = subHead ? "subhead" : "head";

  if (isNative || !isVirtualCardId(sourceTableId)) {
    return (
      <DataSourceCrumbs question={question} variant={variant} {...props} />
    );
  }

  if (originalQuestion?.id() === sourceQuestionId) {
    return (
      <SourceDatasetBreadcrumbs
        question={originalQuestion}
        variant={variant}
        {...props}
      />
    );
  }

  return (
    <Questions.Loader id={sourceQuestionId} loadingAndErrorWrapper={false}>
      {({ question: sourceQuestion }) => {
        if (!sourceQuestion) {
          return null;
        }

        if (
          sourceQuestion.type() === "model" ||
          sourceQuestion.type() === "metric"
        ) {
          return (
            <SourceDatasetBreadcrumbs
              question={sourceQuestion}
              variant={variant}
              {...props}
            />
          );
        }
        return (
          <DataSourceCrumbs question={question} variant={variant} {...props} />
        );
      }}
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
  question: PropTypes.object.isRequired,
};

function SourceDatasetBreadcrumbs({ question, ...props }) {
  const collectionId = question?.collectionId();

  const { data: collection, isFetching } = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );

  if (isFetching) {
    return null;
  }

  return (
    <HeadBreadcrumbs
      {...props}
      parts={[
        <HeadBreadcrumbs.Badge
          key="dataset-collection"
          to={Urls.collection(collection)}
          icon={getQuestionIcon(question)}
          inactiveColor="text-light"
        >
          {collection?.name || t`Our analytics`}
        </HeadBreadcrumbs.Badge>,
        question.isArchived() ? (
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
              {question.displayName()}
            </HeadBreadcrumbs.Badge>
          </Tooltip>
        ) : (
          <HeadBreadcrumbs.Badge
            to={Urls.question(question.card())}
            inactiveColor="text-light"
          >
            {question.displayName()}
          </HeadBreadcrumbs.Badge>
        ),
      ]}
    />
  );
}

QuestionDataSource.shouldRender = ({ question, isObjectDetail = false }) =>
  getDataSourceParts({ question, isObjectDetail }).length > 0;
