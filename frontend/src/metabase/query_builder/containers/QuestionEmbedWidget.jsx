import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { t } from "ttag";

import Icon from "metabase/components/Icon";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { getValueAndFieldIdPopulatedParametersFromCard } from "metabase/parameters/utils/cards";
import { getMetadata } from "metabase/selectors/metadata";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";

const QuestionEmbedWidgetPropTypes = {
  className: PropTypes.string,
  card: PropTypes.object,
  createPublicLink: PropTypes.func,
  deletePublicLink: PropTypes.func,
  updateEnableEmbedding: PropTypes.func,
  updateEmbeddingParams: PropTypes.func,
  metadata: PropTypes.object,
};

const QuestionEmbedWidgetTriggerPropTypes = {
  onClick: PropTypes.func,
};

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
};

class QuestionEmbedWidget extends Component {
  render() {
    const {
      className,
      card,
      createPublicLink,
      deletePublicLink,
      updateEnableEmbedding,
      updateEmbeddingParams,
      metadata,
      ...props
    } = this.props;
    return (
      <EmbedModalContent
        {...props}
        className={className}
        resource={card}
        resourceType="question"
        resourceParameters={getValueAndFieldIdPopulatedParametersFromCard(
          card,
          metadata,
        )}
        onCreatePublicLink={() => createPublicLink(card)}
        onDisablePublicLink={() => deletePublicLink(card)}
        onUpdateEnableEmbedding={enableEmbedding =>
          updateEnableEmbedding(card, enableEmbedding)
        }
        onUpdateEmbeddingParams={embeddingParams =>
          updateEmbeddingParams(card, embeddingParams)
        }
        getPublicUrl={({ public_uuid }, extension) =>
          Urls.publicQuestion(public_uuid, extension)
        }
        extensions={Urls.exportFormats}
      />
    );
  }

  static shouldRender({
    question,
    isAdmin,
    // preferably this would come from props
    isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing"),
    isEmbeddingEnabled = MetabaseSettings.get("enable-embedding"),
  }) {
    if (question.isDataset()) {
      return false;
    }

    return (
      (isPublicLinksEnabled && (isAdmin || question.publicUUID())) ||
      (isEmbeddingEnabled && isAdmin)
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionEmbedWidget);

export function QuestionEmbedWidgetTrigger({ onClick }) {
  return (
    <Icon
      name="share"
      tooltip={t`Sharing`}
      className="mx1 hide sm-show text-brand-hover cursor-pointer"
      onClick={() => {
        MetabaseAnalytics.trackStructEvent(
          "Sharing / Embedding",
          "question",
          "Sharing Link Clicked",
        );
        onClick();
      }}
    />
  );
}

QuestionEmbedWidgetTrigger.propTypes = QuestionEmbedWidgetTriggerPropTypes;
QuestionEmbedWidget.propTypes = QuestionEmbedWidgetPropTypes;
