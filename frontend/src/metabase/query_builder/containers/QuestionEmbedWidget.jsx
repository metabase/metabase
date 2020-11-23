/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";

import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseAnalytics from "metabase/lib/analytics";

import { getParameters } from "metabase/meta/Card";
import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../actions";

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
export default class QuestionEmbedWidget extends Component {
  render() {
    const {
      className,
      card,
      createPublicLink,
      deletePublicLink,
      updateEnableEmbedding,
      updateEmbeddingParams,
      ...props
    } = this.props;
    return (
      <EmbedModalContent
        {...props}
        className={className}
        resource={card}
        resourceType="question"
        resourceParameters={getParameters(card)}
        onCreatePublicLink={() => createPublicLink(card)}
        onDisablePublicLink={() => deletePublicLink(card)}
        onUpdateEnableEmbedding={enableEmbedding =>
          updateEnableEmbedding(card, enableEmbedding)
        }
        onUpdateEmbeddingParams={embeddingParams =>
          updateEmbeddingParams(card, embeddingParams)
        }
        getPublicUrl={({ public_uuid }, extension) =>
          Urls.publicQuestion(public_uuid, extension)
        }
        extensions={Urls.exportFormats}
      />
    );
  }

  static shouldRender({
    question,
    isAdmin,
    // preferably this would come from props
    isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing"),
    isEmbeddingEnabled = MetabaseSettings.get("enable-embedding"),
  }) {
    return (
      (isPublicLinksEnabled && (isAdmin || question.publicUUID())) ||
      (isEmbeddingEnabled && isAdmin)
    );
  }
}

export function QuestionEmbedWidgetTrigger({
  onClick,
}: {
  onClick: () => void,
}) {
  return (
    <Icon
      name="share"
      className="mx1 hide sm-show text-brand-hover cursor-pointer"
      onClick={() => {
        MetabaseAnalytics.trackEvent(
          "Sharing / Embedding",
          "question",
          "Sharing Link Clicked",
        );
        onClick();
      }}
    />
  );
}
