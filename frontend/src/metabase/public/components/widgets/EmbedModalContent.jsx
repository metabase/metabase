/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { titleize } from "inflection";
import { t } from "ttag";

import _ from "underscore";
import { Icon } from "metabase/core/components/Icon";

import {
  getSignedPreviewUrl,
  getUnsignedPreviewUrl,
  getSignedToken,
} from "metabase/public/lib/embed";
import { color } from "metabase/lib/colors";

import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import AdvancedEmbedPane from "./AdvancedEmbedPane";
import SharingPane from "./SharingPane";
import { EmbedTitleLabel } from "./EmbedModalContent.styled";

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state, props),
  siteUrl: getSetting(state, "site-url"),
  secretKey: getSetting(state, "embedding-secret-key"),
  isPublicSharingEnabled: getSetting(state, "enable-public-sharing"),
  isApplicationEmbeddingEnabled: getSetting(state, "enable-embedding"),
});

class EmbedModalContent extends Component {
  constructor(props) {
    super(props);
    const displayOptions = {
      font: null,
      theme: null,
      bordered: true,
      titled: true,
    };
    this.state = {
      pane: "preview",
      embedType: null,
      embeddingParams: getDefaultEmbeddingParams(props),
      displayOptions,
      parameterValues: {},
    };
  }

  static defaultProps = {};

  handleSave = async () => {
    try {
      const { resource } = this.props;
      const { embeddingParams, embedType } = this.state;
      if (embedType === "application") {
        if (!resource.enable_embedding) {
          await this.props.onUpdateEnableEmbedding(true);
        }
        await this.props.onUpdateEmbeddingParams(embeddingParams);
      } else {
        if (!resource.public_uuid) {
          await this.props.onCreatePublicLink();
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  handleUnpublish = async () => {
    await this.props.onUpdateEnableEmbedding(false);
  };

  handleDiscard = () => {
    this.setState({ embeddingParams: getDefaultEmbeddingParams(this.props) });
  };

  getPreviewParameters(resourceParameters, embeddingParams) {
    const lockedParameters = resourceParameters.filter(
      parameter => embeddingParams[parameter.slug] === "locked",
    );

    return lockedParameters;
  }

  getPreviewParamsBySlug() {
    const { resourceParameters } = this.props;
    const { embeddingParams, parameterValues } = this.state;

    const lockedParameters = this.getPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return Object.fromEntries(
      lockedParameters.map(parameter => [
        parameter.slug,
        parameterValues[parameter.id] ?? null,
      ]),
    );
  }

  render() {
    const {
      siteUrl,
      secretKey,
      resource,
      resourceType,
      resourceParameters,
      onClose,
    } = this.props;
    const {
      pane,
      embedType,
      embeddingParams,
      parameterValues,
      displayOptions,
    } = this.state;

    const previewParametersBySlug = this.getPreviewParamsBySlug();
    const previewParameters = this.getPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return (
      <div className="flex flex-column full-height">
        <div
          className="px2 py1 z1 flex align-center"
          style={{
            boxShadow:
              embedType === "application"
                ? `0px 8px 15px -9px ${color("text-dark")}`
                : undefined,
          }}
        >
          <h2 className="ml-auto">
            <EmbedTitle
              onClick={() => this.setState({ embedType: null })}
              type={embedType && titleize(embedType)}
            />
          </h2>
          <Icon
            className="text-light text-medium-hover cursor-pointer p2 ml-auto"
            name="close"
            size={24}
            onClick={() => {
              MetabaseAnalytics.trackStructEvent(
                "Sharing Modal",
                "Modal Closed",
              );
              onClose();
            }}
          />
        </div>
        {embedType == null ? (
          <div className="flex-full">
            {/* Center only using margins because  */}
            <div className="ml-auto mr-auto" style={{ maxWidth: 1040 }}>
              <SharingPane
                {...this.props}
                publicUrl={getUnsignedPreviewUrl(
                  siteUrl,
                  resourceType,
                  resource.public_uuid,
                  displayOptions,
                )}
                iframeUrl={getUnsignedPreviewUrl(
                  siteUrl,
                  resourceType,
                  resource.public_uuid,
                  displayOptions,
                )}
                onChangeEmbedType={embedType => this.setState({ embedType })}
              />
            </div>
          </div>
        ) : embedType === "application" ? (
          <div className="flex flex-full">
            <AdvancedEmbedPane
              pane={pane}
              resource={resource}
              resourceType={resourceType}
              embedType={embedType}
              token={getSignedToken(
                resourceType,
                resource.id,
                previewParametersBySlug,
                secretKey,
                embeddingParams,
              )}
              iframeUrl={getSignedPreviewUrl(
                siteUrl,
                resourceType,
                resource.id,
                previewParametersBySlug,
                displayOptions,
                secretKey,
                embeddingParams,
              )}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={previewParametersBySlug}
              displayOptions={displayOptions}
              previewParameters={previewParameters}
              parameterValues={parameterValues}
              resourceParameters={resourceParameters}
              embeddingParams={embeddingParams}
              onChangeDisplayOptions={displayOptions =>
                this.setState({ displayOptions })
              }
              onChangeEmbeddingParameters={embeddingParams =>
                this.setState({ embeddingParams })
              }
              onChangeParameterValue={(id, value) =>
                this.setState({
                  parameterValues: {
                    ...parameterValues,
                    [id]: value,
                  },
                })
              }
              onChangePane={pane => this.setState({ pane })}
              onSave={this.handleSave}
              onUnpublish={this.handleUnpublish}
              onDiscard={this.handleDiscard}
            />
          </div>
        ) : null}
      </div>
    );
  }
}

function getDefaultEmbeddingParams(props) {
  const { resource, resourceParameters } = props;

  return filterValidResourceParameters(
    resource.embedding_params || {},
    resourceParameters,
  );
}

function filterValidResourceParameters(embeddingParams, resourceParameters) {
  const validParameters = resourceParameters.map(parameter => parameter.slug);

  return _.pick(embeddingParams, validParameters);
}

export const EmbedTitle = ({ type, onClick }) => (
  <a className="flex align-center" onClick={onClick}>
    <EmbedTitleLabel>{t`Sharing`}</EmbedTitleLabel>
    {type && <Icon name="chevronright" className="mx1 text-medium" />}
    {type}
  </a>
);

export default connect(mapStateToProps)(EmbedModalContent);
