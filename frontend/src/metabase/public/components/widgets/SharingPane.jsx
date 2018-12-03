/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import RetinaImage from "react-retina-image";
import Icon from "metabase/components/Icon";
import Toggle from "metabase/components/Toggle";
import CopyWidget from "metabase/components/CopyWidget";
import Confirm from "metabase/components/Confirm";

import { getPublicEmbedHTML } from "metabase/public/lib/code";

import cx from "classnames";

import type { EmbedType } from "./EmbedModalContent";
import type { EmbeddableResource } from "metabase/public/lib/types";

import MetabaseAnalytics from "metabase/lib/analytics";

type Props = {
  resourceType: string,
  resource: EmbeddableResource,
  extensions?: string[],

  isAdmin: boolean,

  isPublicSharingEnabled: boolean,
  isApplicationEmbeddingEnabled: boolean,

  onCreatePublicLink: () => Promise<void>,
  onDisablePublicLink: () => Promise<void>,
  getPublicUrl: (resource: EmbeddableResource, extension: ?string) => string,
  onChangeEmbedType: (embedType: EmbedType) => void,
};

type State = {
  extension: ?string,
};

export default class SharingPane extends Component {
  props: Props;
  state: State = {
    extension: null,
  };

  static defaultProps = {
    extensions: [],
  };

  render() {
    const {
      resource,
      resourceType,
      onCreatePublicLink,
      onDisablePublicLink,
      extensions,
      getPublicUrl,
      onChangeEmbedType,
      isAdmin,
      isPublicSharingEnabled,
      isApplicationEmbeddingEnabled,
    } = this.props;

    const publicLink = getPublicUrl(resource, this.state.extension);
    const iframeSource = getPublicEmbedHTML(getPublicUrl(resource));

    return (
      <div className="pt2 ml-auto mr-auto" style={{ maxWidth: 600 }}>
        {isAdmin &&
          isPublicSharingEnabled && (
            <div className="pb2 mb4 border-bottom flex align-center">
              <h4>{t`Enable sharing`}</h4>
              <div className="ml-auto">
                {resource.public_uuid ? (
                  <Confirm
                    title={t`Disable this public link?`}
                    content={t`This will cause the existing link to stop working. You can re-enable it, but when you do it will be a different link.`}
                    action={() => {
                      MetabaseAnalytics.trackEvent(
                        "Sharing Modal",
                        "Public Link Disabled",
                        resourceType,
                      );
                      onDisablePublicLink();
                    }}
                  >
                    <Toggle value={true} />
                  </Confirm>
                ) : (
                  <Toggle
                    value={false}
                    onChange={() => {
                      MetabaseAnalytics.trackEvent(
                        "Sharing Modal",
                        "Public Link Enabled",
                        resourceType,
                      );
                      onCreatePublicLink();
                    }}
                  />
                )}
              </div>
            </div>
          )}
        <div
          className={cx("mb4 flex align-center", {
            disabled: !resource.public_uuid,
          })}
        >
          <div
            style={{ width: 98, height: 63 }}
            className="bordered rounded shadowed flex layout-centered"
          >
            <Icon name="link" size={32} />
          </div>
          <div className="ml2">
            <h3 className="text-brand mb1">{t`Public link`}</h3>
            <div className="mb1">{t`Share this ${resourceType} with people who don't have a Metabase account using the URL below:`}</div>
            <CopyWidget value={publicLink} />
            {extensions &&
              extensions.length > 0 && (
                <div className="mt1">
                  {extensions.map(extension => (
                    <span
                      className={cx(
                        "cursor-pointer text-brand-hover text-bold text-uppercase",
                        extension === this.state.extension
                          ? "text-brand"
                          : "text-light",
                      )}
                      onClick={() =>
                        this.setState({
                          extension:
                            extension === this.state.extension
                              ? null
                              : extension,
                        })
                      }
                    >
                      {extension}{" "}
                    </span>
                  ))}
                </div>
              )}
          </div>
        </div>
        <div
          className={cx("mb4 flex align-center", {
            disabled: !resource.public_uuid,
          })}
        >
          <RetinaImage
            width={98}
            src="app/assets/img/simple_embed.png"
            forceOriginalDimensions={false}
          />
          <div className="ml2">
            <h3 className="text-green mb1">{t`Public embed`}</h3>
            <div className="mb1">{t`Embed this ${resourceType} in blog posts or web pages by copying and pasting this snippet:`}</div>
            <CopyWidget value={iframeSource} />
          </div>
        </div>
        {isAdmin && (
          <div
            className={cx("mb4 flex align-center cursor-pointer", {
              disabled: !isApplicationEmbeddingEnabled,
            })}
            onClick={() => onChangeEmbedType("application")}
          >
            <RetinaImage
              width={100}
              src="app/assets/img/secure_embed.png"
              forceOriginalDimensions={false}
            />
            <div className="ml2">
              <h3 className="text-purple mb1">{t`Embed this ${resourceType} in an application`}</h3>
              <div className="">{t`By integrating with your application server code, you can provide a secure stats ${resourceType} limited to a specific user, customer, organization, etc.`}</div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
