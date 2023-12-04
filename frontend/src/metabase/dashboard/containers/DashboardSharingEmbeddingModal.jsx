/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getParameters } from "metabase/dashboard/selectors";
import * as Urls from "metabase/lib/urls";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";
import {EmbedModalWrapper} from "metabase/public/components/widgets/EmbedModalWrapper";

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
      <EmbedModalWrapper
        isOpen={enabled}
        onClose={onClose}
        fit
        formModal={false}
        header={t`Embed Metabase`}
      >
        <EmbedModalContent
          {...props}
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
          getPublicUrl={({ public_uuid }) =>
            Urls.publicDashboard({ uuid: public_uuid })
          }
        />
      </EmbedModalWrapper>
    );
  }
}

DashboardSharingEmbeddingModal.defaultProps = defaultProps;

export const DashboardSharingEmbeddingModalConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardSharingEmbeddingModal);
