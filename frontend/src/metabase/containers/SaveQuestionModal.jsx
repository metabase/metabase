/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { CSSTransitionGroup } from "react-transition-group";
import { t } from "ttag";

import Form, { FormField, FormFooter } from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";
import Radio from "metabase/core/components/Radio";
import * as Q_DEPRECATED from "metabase/lib/query";
import { generateQueryDescription } from "metabase/lib/query/description";
import validate from "metabase/lib/validate";
import { canonicalCollectionId } from "metabase/collections/utils";

import "./SaveQuestionModal.css";

export default class SaveQuestionModal extends Component {
  static propTypes = {
    card: PropTypes.object.isRequired,
    originalCard: PropTypes.object,
    tableMetadata: PropTypes.object, // can't be required, sometimes null
    onCreate: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    multiStep: PropTypes.bool,
  };

  validateName = (name, context) => {
    if (context.form.saveType.value !== "overwrite") {
      // We don't care if the form is valid when overwrite mode is enabled,
      // as original question's data will be submitted instead of the form values
      return validate.required()(name);
    }
  };

  handleSubmit = async details => {
    // TODO Atte Keinäenn 31/1/18 Refactor this
    // I think that the primary change should be that
    // SaveQuestionModal uses Question objects instead of directly modifying card objects –
    // but that is something that doesn't need to be done first)
    // question
    //     .setDisplayName(details.name.trim())
    //     .setDescription(details.description ? details.description.trim() : null)
    //     .setCollectionId(details.collection_id)
    let { card, originalCard, onCreate, onSave } = this.props;

    const collection_id = canonicalCollectionId(
      details.saveType === "overwrite"
        ? originalCard.collection_id
        : details.collection_id,
    );

    card = {
      ...card,
      name:
        details.saveType === "overwrite"
          ? originalCard.name
          : details.name.trim(),
      // since description is optional, it can be null, so check for a description before trimming it
      description:
        details.saveType === "overwrite"
          ? originalCard.description
          : details.description
          ? details.description.trim()
          : null,
      collection_id,
    };

    if (details.saveType === "create") {
      await onCreate(card);
    } else if (details.saveType === "overwrite") {
      card.id = this.props.originalCard.id;
      await onSave(card);
    }
  };

  render() {
    const { card, originalCard, initialCollectionId, tableMetadata } =
      this.props;

    const isStructured = Q_DEPRECATED.isStructured(card.dataset_query);
    const isReadonly = originalCard != null && !originalCard.can_write;

    const initialValues = {
      name:
        card.name || isStructured
          ? generateQueryDescription(tableMetadata, card.dataset_query.query)
          : "",
      description: card.description || "",
      collection_id:
        card.collection_id === undefined || isReadonly
          ? initialCollectionId
          : card.collection_id,
      saveType:
        originalCard && !originalCard.dataset && originalCard.can_write
          ? "overwrite"
          : "create",
    };

    const title = this.props.multiStep
      ? t`First, save your question`
      : t`Save question`;

    const showSaveType =
      !card.id &&
      !!originalCard &&
      !originalCard.dataset &&
      originalCard.can_write;

    return (
      <ModalContent
        id="SaveQuestionModal"
        title={title}
        onClose={this.props.onClose}
      >
        <Form
          initialValues={initialValues}
          fields={[
            { name: "saveType" },
            {
              name: "name",
              validate: this.validateName,
            },
            { name: "description" },
            { name: "collection_id" },
          ]}
          onSubmit={this.handleSubmit}
          overwriteOnInitialValuesChange
        >
          {({ values, Form }) => (
            <Form>
              <FormField
                name="saveType"
                title={t`Replace or save as new?`}
                type={SaveTypeInput}
                hidden={!showSaveType}
                originalCard={originalCard}
              />
              <CSSTransitionGroup
                component="div"
                transitionName="saveQuestionModalFields"
                transitionEnterTimeout={500}
                transitionLeaveTimeout={500}
              >
                {values.saveType === "create" && (
                  <div className="saveQuestionModalFields">
                    <FormField
                      autoFocus
                      name="name"
                      title={t`Name`}
                      placeholder={t`What is the name of your card?`}
                    />
                    <FormField
                      name="description"
                      type="text"
                      title={t`Description`}
                      placeholder={t`It's optional but oh, so helpful`}
                    />
                    <FormField
                      name="collection_id"
                      title={t`Which collection should this go in?`}
                      type="collection"
                    />
                  </div>
                )}
              </CSSTransitionGroup>
              <FormFooter submitTitle={t`Save`} onCancel={this.props.onClose} />
            </Form>
          )}
        </Form>
      </ModalContent>
    );
  }
}

const SaveTypeInput = ({ field, originalCard }) => (
  <Radio
    {...field}
    options={[
      {
        name: t`Replace original question, "${
          originalCard && originalCard.name
        }"`,
        value: "overwrite",
      },
      { name: t`Save as new question`, value: "create" },
    ]}
    vertical
  />
);
