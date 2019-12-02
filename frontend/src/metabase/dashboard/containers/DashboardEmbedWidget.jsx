/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import cx from "classnames";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
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

const mapDispatchToProps = {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
};

@connect(
  null,
  mapDispatchToProps,
)
export default class DashboardEmbedWidget extends Component {
  _modal: ?ModalWithTrigger;

  render() {
    const {
      className,
      dashboard,
      createPublicLink,
      deletePublicLink,
      updateEnableEmbedding,
      updateEmbeddingParams,
      ...props
    } = this.props;
    return (
      <ModalWithTrigger
        ref={m => (this._modal = m)}
        full
        triggerElement={
          <Tooltip tooltip={t`Sharing and embedding`}>
            <Icon
              name="share"
              onClick={() =>
                MetabaseAnalytics.trackEvent(
                  "Sharing / Embedding",
                  "dashboard",
                  "Sharing Link Clicked",
                )
              }
            />
          </Tooltip>
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
          }}
          getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
        />
      </ModalWithTrigger>
    );
  }
}
