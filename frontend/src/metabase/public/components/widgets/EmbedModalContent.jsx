import { Component } from "react";
import { connect } from "react-redux";

import _ from "underscore";

import PropTypes from "prop-types";
import { getSignedPreviewUrl, getSignedToken } from "metabase/public/lib/embed";

import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import AdvancedEmbedPane from "./AdvancedEmbedPane";
import { SharingPane } from "./SharingPane";

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
      embeddingParams: getDefaultEmbeddingParams(props),
      displayOptions,
      parameterValues: {},
    };
  }

  static defaultProps = {};

  handleSave = async () => {
    try {
      const { resource, embedType } = this.props;
      const { embeddingParams } = this.state;
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
      embedType,
      setEmbedType,
    } = this.props;
    const { pane, embeddingParams, parameterValues, displayOptions } =
      this.state;

    const previewParametersBySlug = this.getPreviewParamsBySlug();
    const previewParameters = this.getPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return embedType == null ? (
      <SharingPane {...this.props} onChangeEmbedType={setEmbedType} />
    ) : embedType === "application" ? (
      <div className="flex flex-full" style={{ height: "100%" }}>
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
    ) : null;
  }
}

EmbedModalContent.propTypes = {
  resource: PropTypes.object.isRequired,
  resourceType: PropTypes.string,
  resourceParameters: PropTypes.array.isRequired,

  siteUrl: PropTypes.string.isRequired,
  secretKey: PropTypes.string.isRequired,

  onCreatePublicLink: PropTypes.func,
  onUpdateEnableEmbedding: PropTypes.func,
  onUpdateEmbeddingParams: PropTypes.func,

  embedType: PropTypes.string,
  setEmbedType: PropTypes.func.isRequired,
};

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

export default connect(mapStateToProps)(EmbedModalContent);
