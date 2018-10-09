/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import EmbedWidget from "metabase/public/components/widgets/EmbedWidget";

import * as Urls from "metabase/lib/urls";

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

@connect(null, mapDispatchToProps)
export default class DashboardEmbedWidget extends Component {
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
      <EmbedWidget
        {...props}
        className={className}
        resource={dashboard}
        resourceType="dashboard"
        resourceParameters={dashboard && dashboard.parameters}
        onCreatePublicLink={() => createPublicLink(dashboard)}
        onDisablePublicLink={() => deletePublicLink(dashboard)}
        onUpdateEnableEmbedding={enableEmbedding =>
          updateEnableEmbedding(dashboard, enableEmbedding)
        }
        onUpdateEmbeddingParams={embeddingParams =>
          updateEmbeddingParams(dashboard, embeddingParams)
        }
        getPublicUrl={({ public_uuid }) => Urls.publicDashboard(public_uuid)}
      />
    );
  }
}
