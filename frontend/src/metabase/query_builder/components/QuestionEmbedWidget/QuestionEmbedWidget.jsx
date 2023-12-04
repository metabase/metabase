import { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/parameters/utils/cards";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../../actions";

const QuestionEmbedWidgetPropTypes = {
  className: PropTypes.string,
  card: PropTypes.object,
  createPublicLink: PropTypes.func,
  deletePublicLink: PropTypes.func,
  updateEnableEmbedding: PropTypes.func,
  updateEmbeddingParams: PropTypes.func,
  metadata: PropTypes.object,
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
        resourceParameters={getCardUiParameters(card, metadata)}
        onCreatePublicLink={() => createPublicLink(card)}
        onDisablePublicLink={() => deletePublicLink(card)}
        onUpdateEnableEmbedding={enableEmbedding =>
          updateEnableEmbedding(card, enableEmbedding)
        }
        onUpdateEmbeddingParams={embeddingParams =>
          updateEmbeddingParams(card, embeddingParams)
        }
        getPublicUrl={({ public_uuid }, extension) =>
          Urls.publicQuestion({ uuid: public_uuid, type: extension })
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

QuestionEmbedWidget.propTypes = QuestionEmbedWidgetPropTypes;
