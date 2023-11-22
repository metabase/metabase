/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getParameters } from "metabase/dashboard/selectors";
import * as Urls from "metabase/lib/urls";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import Modal from "metabase/components/Modal";
import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";
import { ModalTrigger } from "./DashboardSharingEmbeddingModal.styled";

const defaultProps = {
  isLinkEnabled: true,
  triggerElement: null,
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
      <Modal
        full
        disabled={!isLinkEnabled}
        as={ModalTrigger}
        triggerElement={
          <span
            className={linkClassNames}
            aria-disabled={!isLinkEnabled}
            onClick={() => {
              if (isLinkEnabled) {
                MetabaseAnalytics.trackStructEvent(
                  "Sharing / Embedding",
                  "dashboard",
                  "Sharing Link Clicked",
                );
              }
            }}
          >
            {linkText}
          </span>
        }
        triggerClasses={className}
        className="scroll-y"
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
          getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
        />
      </Modal>
    );
  }
}

DashboardSharingEmbeddingModal.defaultProps = defaultProps;

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardSharingEmbeddingModal);
