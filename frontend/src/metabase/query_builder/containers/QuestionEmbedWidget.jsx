/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import EmbedWidget from "metabase/public/components/widgets/EmbedWidget";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";

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
      <EmbedWidget
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
        extensions={["csv", "xlsx", "json"]}
      />
    );
  }

  static shouldRender({
    question,
    isAdmin,
    // preferably this would come from props
    isPublicLinksEnabled = MetabaseSettings.get("public_sharing"),
    isEmbeddingEnabled = MetabaseSettings.get("embedding"),
  }) {
    return (
      question.isSaved() &&
      ((isPublicLinksEnabled && (isAdmin || question.publicUUID())) ||
        (isEmbeddingEnabled && isAdmin))
    );
  }
}
