/* eslint-disable react/prop-types */
import { Component } from "react";

import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  getPublicEmbedOptions,
  getSignedEmbedOptions,
  getSignTokenOptions,
} from "../../lib/code";
import CodeSample from "./CodeSample";

import "metabase/lib/ace/theme-metabase";

import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-ruby";
import "ace/mode-html";
import "ace/mode-jsx";

export default class EmbedCodePane extends Component {
  render() {
    const {
      className,
      embedType,
      iframeUrl,
      siteUrl,
      secretKey,
      resource,
      resourceType,
      params,
      displayOptions,
    } = this.props;
    return (
      <div className={className}>
        {embedType === "application" ? (
          <div key="application">
            <p>{t`To embed this ${resourceType} in your application:`}</p>
            <CodeSample
              title={t`Insert this code snippet in your server code to generate the signed embedding URL `}
              options={getSignTokenOptions({
                siteUrl,
                secretKey,
                resourceType,
                resourceId: resource.id,
                params,
                displayOptions,
              })}
              onChangeOption={option => {
                if (
                  option &&
                  option.embedOption &&
                  this._embedSample &&
                  this._embedSample.setOption
                ) {
                  this._embedSample.setOption(option.embedOption);
                }
              }}
              dataTestId="embed-backend"
            />
            <CodeSample
              className="mt2"
              ref={embedSample => (this._embedSample = embedSample)}
              title={t`Then insert this code snippet in your HTML template or single page app.`}
              options={getSignedEmbedOptions({ iframeUrl })}
              dataTestId="embed-frontend"
            />
          </div>
        ) : (
          <div key="public">
            <CodeSample
              title={t`Embed code snippet for your HTML or Frontend Application`}
              options={getPublicEmbedOptions({ iframeUrl })}
            />
          </div>
        )}

        <div className="text-centered my2">
          <h4>{jt`More ${(
            <ExternalLink href="https://github.com/metabase/embedding-reference-apps">
              {t`examples on GitHub`}
            </ExternalLink>
          )}`}</h4>
        </div>
      </div>
    );
  }
}
