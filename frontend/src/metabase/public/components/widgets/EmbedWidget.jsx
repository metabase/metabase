/* @flow */

import React, { Component } from "react";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import { t } from "c-3po";
import MetabaseAnalytics from "metabase/lib/analytics";

import EmbedModalContent from "./EmbedModalContent";

import cx from "classnames";

import type {
  EmbeddableResource,
  EmbeddingParams,
} from "metabase/public/lib/types";
import type { Parameter } from "metabase/meta/types/Parameter";

type Props = {
  className?: string,

  resource: EmbeddableResource,
  resourceType: string,
  resourceParameters: Parameter[],

  siteUrl: string,
  secretKey: string,
  isAdmin: boolean,

  getPublicUrl: (resource: EmbeddableResource, extension: ?string) => string,

  onUpdateEnableEmbedding: (enable_embedding: boolean) => Promise<void>,
  onUpdateEmbeddingParams: (embedding_params: EmbeddingParams) => Promise<void>,
  onCreatePublicLink: () => Promise<void>,
  onDisablePublicLink: () => Promise<void>,
};

export default class EmbedWidget extends Component {
  props: Props;

  _modal: ?ModalWithTrigger;

  render() {
    const { className, resourceType } = this.props;
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
                  resourceType,
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
          {...this.props}
          onClose={() => {
            this._modal && this._modal.close();
          }}
          className="full-height"
        />
      </ModalWithTrigger>
    );
  }
}
