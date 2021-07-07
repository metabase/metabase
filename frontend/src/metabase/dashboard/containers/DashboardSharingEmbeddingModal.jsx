/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import cx from "classnames";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";

import * as Urls from "metabase/lib/urls";
import MetabaseAnalytics from "metabase/lib/analytics";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../dashboard";

const defaultProps = {
  isLinkEnabled: true,
};

const mapDispatchToProps = {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
};

class DashboardSharingEmbeddingModal extends Component {
  _modal: ?ModalWithTrigger;

  render() {
    const {
      additionalClickActions,
      className,
      createPublicLink,
      dashboard,
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
        triggerElement={
          <a
            className={linkClassNames}
            aria-disabled={!isLinkEnabled}
            onClick={() => {
              if (isLinkEnabled) {
                MetabaseAnalytics.trackEvent(
                  "Sharing / Embedding",
                  "dashboard",
                  "Sharing Link Clicked",
                );
              }
            }}
          >
            {linkText}
          </a>
        }
        triggerClasses={cx(className, "text-brand-hover")}
        className="scroll-y"
      >
        <EmbedModalContent
          {...props}
          className={className}
          resource={dashboard}
          resourceParameters={dashboard && dashboard.parameters}
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

export default connect(
  null,
  mapDispatchToProps,
)(DashboardSharingEmbeddingModal);
