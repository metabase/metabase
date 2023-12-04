import { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";

import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { EmbedModal } from "metabase/public/components/widgets/EmbedModal";
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
  onClose: PropTypes.func,
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
  constructor(props) {
    super(props);
    this.state = {
      embedType: null,
    };
  }

  render() {
    const {
      className,
      card,
      createPublicLink,
      deletePublicLink,
      updateEnableEmbedding,
      updateEmbeddingParams,
      metadata,
      onClose,
      ...props
    } = this.props;
    return (
      <EmbedModal onClose={onClose} embedType={this.state.embedType}>
        <EmbedModalContent
          {...props}
          embedType={this.state.embedType}
          setEmbedType={embedType => this.setState({ embedType })}
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
      </EmbedModal>
    );
  }
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(QuestionEmbedWidget);

QuestionEmbedWidget.propTypes = QuestionEmbedWidgetPropTypes;
