/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getParameters } from "metabase/dashboard/selectors";
import * as Urls from "metabase/lib/urls";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";
import { ModalTrigger } from "./DashboardSharingEmbeddingModal.styled";

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
  _modal;

  render() {
    const {
      additionalClickActions,
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
      ...props
    } = this.props;
    if (!enabled) {
      return null;
    }
    return (
      <ModalWithTrigger
        ref={m => (this._modal = m)}
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
          onClose={() => {
            this._modal && this._modal.close();
            additionalClickActions();
          }}
          getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
        />
      </ModalWithTrigger>
    );
  }
}

DashboardSharingEmbeddingModal.defaultProps = defaultProps;

export const DashboardSharingEmbeddingModalConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashboardSharingEmbeddingModal);
