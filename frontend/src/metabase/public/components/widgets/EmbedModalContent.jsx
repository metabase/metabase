/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { titleize } from "inflection";

import { t } from "ttag";

import Icon from "metabase/components/Icon";

import SharingPane from "./SharingPane";
import AdvancedEmbedPane from "./AdvancedEmbedPane";

import {
  getSignedPreviewUrl,
  getUnsignedPreviewUrl,
  getSignedToken,
} from "metabase/public/lib/embed";
import { color } from "metabase/lib/colors";

import {
  getSiteUrl,
  getEmbeddingSecretKey,
  getIsPublicSharingEnabled,
  getIsApplicationEmbeddingEnabled,
} from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import MetabaseAnalytics from "metabase/lib/analytics";

import type { Parameter, ParameterId } from "metabase-types/types/Parameter";
import type {
  EmbeddableResource,
  EmbeddingParams,
} from "metabase/public/lib/types";

export type Pane = "preview" | "code";
export type EmbedType = null | "simple" | "application";

export type DisplayOptions = {
  theme: ?string,
  bordered: boolean,
  titled: boolean,
};

type Props = {
  className?: string,
  resource: EmbeddableResource,
  resourceType: string,
  resourceParameters: Parameter[],

  isAdmin: boolean,
  siteUrl: string,
  secretKey: string,

  // Flow doesn't understand these are provided by @connect?
  // isPublicSharingEnabled: bool,
  // isApplicationEmbeddingEnabled: bool,

  getPublicUrl: (resource: EmbeddableResource, extension: ?string) => string,

  onUpdateEnableEmbedding: (enable_embedding: boolean) => Promise<void>,
  onUpdateEmbeddingParams: (embedding_params: EmbeddingParams) => Promise<void>,
  onCreatePublicLink: () => Promise<void>,
  onDisablePublicLink: () => Promise<void>,
  onClose: () => void,
};

type State = {
  pane: Pane,
  embedType: EmbedType,
  embeddingParams: EmbeddingParams,
  displayOptions: DisplayOptions,
  parameterValues: { [id: ParameterId]: string },
};

const mapStateToProps = (state, props) => ({
  isAdmin: getUserIsAdmin(state, props),
  siteUrl: getSiteUrl(state, props),
  secretKey: getEmbeddingSecretKey(state, props),
  isPublicSharingEnabled: getIsPublicSharingEnabled(state, props),
  isApplicationEmbeddingEnabled: getIsApplicationEmbeddingEnabled(state, props),
});

@connect(mapStateToProps)
export default class EmbedModalContent extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      pane: "preview",
      embedType: null,
      embeddingParams: props.resource.embedding_params || {},
      displayOptions: {
        theme: null,
        bordered: true,
        titled: true,
      },

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
    const { resource } = this.props;
    this.setState({ embeddingParams: resource.embedding_params || {} });
  };

  getPreviewParams() {
    const { resourceParameters } = this.props;
    const { embeddingParams, parameterValues } = this.state;
    const params = {};
    for (const parameter of resourceParameters) {
      if (embeddingParams[parameter.slug] === "locked") {
        params[parameter.slug] =
          parameter.id in parameterValues
            ? parameterValues[parameter.id]
            : null;
      }
    }
    return params;
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

    const params = this.getPreviewParams();

    const previewParameters = resourceParameters.filter(
      p => embeddingParams[p.slug] === "locked",
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
              MetabaseAnalytics.trackEvent("Sharing Modal", "Modal Closed");
              onClose();
            }}
          />
        </div>
        {embedType == null ? (
          <div className="flex-full">
            {/* Center only using margins because  */}
            <div className="ml-auto mr-auto" style={{ maxWidth: 1040 }}>
              <SharingPane
                // $FlowFixMe: Flow doesn't understand these are provided by @connect?
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
                params,
                secretKey,
                embeddingParams,
              )}
              iframeUrl={getSignedPreviewUrl(
                siteUrl,
                resourceType,
                resource.id,
                params,
                displayOptions,
                secretKey,
                embeddingParams,
              )}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
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

export const EmbedTitle = ({
  type,
  onClick,
}: {
  type: ?string,
  onClick: () => any,
}) => (
  <a className="flex align-center" onClick={onClick}>
    <span className="text-brand-hover">{t`Sharing`}</span>
    {type && <Icon name="chevronright" className="mx1 text-medium" />}
    {type}
  </a>
);
