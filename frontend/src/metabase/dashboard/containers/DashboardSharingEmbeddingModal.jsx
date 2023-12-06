/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getParameters } from "metabase/dashboard/selectors";
import * as Urls from "metabase/lib/urls";

import { EmbedModal } from "metabase/public/components/widgets/EmbedModal";
import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";

const defaultProps = {
  isLinkEnabled: true,
};

const mapStateToProps = (state, props) => ({
  parameters: getParameters(state, props),
});

const mapDispatchToProps = {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
};

class DashboardSharingEmbeddingModal extends Component {
  constructor(props) {
    super(props);
    this.state = {
      embedType: null,
    };
  }
  render() {
    const {
      className,
      createPublicLink,
      dashboard,
      parameters,
      deletePublicLink,
      enabled,
      linkClassNames,
      linkText,
      isLinkEnabled,
      updateEnableEmbedding,
      updateEmbeddingParams,
      onClose,
      ...props
    } = this.props;
    if (!enabled) {
      return null;
    }
    return (
      <EmbedModal
        isOpen={enabled}
        onClose={onClose}
        embedType={this.state.embedType}
        fit
        formModal={false}
        header={t`Embed Metabase`}
      >
        <EmbedModalContent
          {...props}
          embedType={this.state.embedType}
          setEmbedType={embedType => this.setState({ embedType })}
          className={className}
          resource={dashboard}
          resourceParameters={parameters}
          resourceType="dashboard"
          onCreatePublicLink={() => createPublicLink(dashboard)}
          onDisablePublicLink={() => deletePublicLink(dashboard)}
          onUpdateEnableEmbedding={enableEmbedding =>
            updateEnableEmbedding(dashboard, enableEmbedding)
          }
          onUpdateEmbeddingParams={embeddingParams =>
            updateEmbeddingParams(dashboard, embeddingParams)
          }
          onClose={onClose}
          getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
        />
      </EmbedModal>
    );
  }
}

DashboardSharingEmbeddingModal.defaultProps = defaultProps;

export const DashboardSharingEmbeddingModalConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardSharingEmbeddingModal);
