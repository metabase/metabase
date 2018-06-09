import React, { Component } from "react";
import PropTypes from "prop-types";

import { CSSTransitionGroup } from "react-transition-group";

import FormField from "metabase/components/form/FormField.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import Radio from "metabase/components/Radio.jsx";
import Button from "metabase/components/Button";
import CollectionSelect from "metabase/containers/CollectionSelect";

import Query from "metabase/lib/query";
import { t } from "c-3po";
import "./SaveQuestionModal.css";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";

export default class SaveQuestionModal extends Component {
  constructor(props, context) {
    super(props, context);

    const isStructured = Query.isStructured(props.card.dataset_query);

    this.state = {
      error: null,
      valid: false,
      details: {
        name:
          props.card.name || isStructured
            ? Query.generateQueryDescription(
                props.tableMetadata,
                props.card.dataset_query.query,
              )
            : "",
        description: props.card.description || "",
        collection_id: props.card.collection_id || null,
        saveType: props.originalCard ? "overwrite" : "create",
      },
    };
  }

  static propTypes = {
    card: PropTypes.object.isRequired,
    originalCard: PropTypes.object,
    tableMetadata: PropTypes.object, // can't be required, sometimes null
    createFn: PropTypes.func.isRequired,
    saveFn: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    multiStep: PropTypes.bool,
  };

  componentDidMount() {
    this.validateForm();
  }

  componentDidUpdate() {
    this.validateForm();
  }

  validateForm() {
    let { details } = this.state;

    let valid = true;

    // name is required for create
    if (details.saveType === "create" && !details.name) {
      valid = false;
    }

    if (this.state.valid !== valid) {
      this.setState({ valid });
    }
  }

  onChange(fieldName, fieldValue) {
    this.setState({
      details: {
        ...this.state.details,
        [fieldName]: fieldValue ? fieldValue : null,
      },
    });
  }

  formSubmitted = async e => {
    try {
      if (e) {
        e.preventDefault();
      }

      let { details } = this.state;
      // TODO Atte Keinäenn 31/1/18 Refactor this
      // I think that the primary change should be that
      // SaveQuestionModal uses Question objects instead of directly modifying card objects –
      // but that is something that doesn't need to be done first)
      // question
      //     .setDisplayName(details.name.trim())
      //     .setDescription(details.description ? details.description.trim() : null)
      //     .setCollectionId(details.collection_id)
      let { card, originalCard, createFn, saveFn } = this.props;

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
            : details.description ? details.description.trim() : null,
        collection_id:
          details.saveType === "overwrite"
            ? originalCard.collection_id
            : details.collection_id,
      };

      if (details.saveType === "create") {
        await createFn(card);
      } else if (details.saveType === "overwrite") {
        card.id = this.props.originalCard.id;
        await saveFn(card);
      }

      this.props.onClose();
    } catch (error) {
      if (error && !error.isCanceled) {
        this.setState({ error: error });
      }

      // Throw error for ButtonWithStatus
      throw error;
    }
  };

  render() {
    let { error, details } = this.state;
    let formError;
    if (error) {
      let errorMessage;
      if (error.status === 500) {
        errorMessage = t`Server error encountered`;
      }

      if (error.data && error.data.message) {
        errorMessage = error.data.message;
      }
      if (error.data && error.data.errors) {
        errorMessage = Object.values(error.data.errors);
      }

      // TODO: timeout display?
      if (errorMessage) {
        formError = <span className="text-error px2">{errorMessage}</span>;
      }
    }

    let saveOrUpdate = null;
    if (!this.props.card.id && this.props.originalCard) {
      saveOrUpdate = (
        <FormField
          name="saveType"
          displayName={t`Replace or save as new?`}
          formError={this.state.errors}
        >
          <Radio
            value={this.state.details.saveType}
            onChange={value => this.onChange("saveType", value)}
            options={[
              {
                name: t`Replace original question, "${
                  this.props.originalCard.name
                }"`,
                value: "overwrite",
              },
              { name: t`Save as new question`, value: "create" },
            ]}
            isVertical
          />
        </FormField>
      );
    }

    let title = this.props.multiStep
      ? t`First, save your question`
      : t`Save question`;

    return (
      <ModalContent
        id="SaveQuestionModal"
        title={title}
        footer={[
          formError,
          <Button onClick={this.props.onClose}>{t`Cancel`}</Button>,
          <ButtonWithStatus
            disabled={!this.state.valid}
            onClickOperation={this.formSubmitted}
          />,
        ]}
        onClose={this.props.onClose}
      >
        <form className="Form-inputs" onSubmit={this.formSubmitted}>
          {saveOrUpdate}
          <CSSTransitionGroup
            transitionName="saveQuestionModalFields"
            transitionEnterTimeout={500}
            transitionLeaveTimeout={500}
          >
            {details.saveType === "create" && (
              <div
                key="saveQuestionModalFields"
                className="saveQuestionModalFields"
              >
                <FormField
                  name="name"
                  displayName={t`Name`}
                  formError={this.state.errors}
                >
                  <input
                    className="Form-input full"
                    name="name"
                    placeholder={t`What is the name of your card?`}
                    value={this.state.details.name}
                    onChange={e => this.onChange("name", e.target.value)}
                    autoFocus
                  />
                </FormField>
                <FormField
                  name="description"
                  displayName={t`Description`}
                  formError={this.state.errors}
                >
                  <textarea
                    className="Form-input full"
                    name="description"
                    placeholder={t`It's optional but oh, so helpful`}
                    value={this.state.details.description}
                    onChange={e => this.onChange("description", e.target.value)}
                  />
                </FormField>
                <FormField
                  name="collection_id"
                  displayName={t`Which collection should this go in?`}
                  formError={this.state.errors}
                >
                  <CollectionSelect
                    className="block"
                    value={this.state.details.collection_id}
                    onChange={value => this.onChange("collection_id", value)}
                  />
                </FormField>
              </div>
            )}
          </CSSTransitionGroup>
        </form>
      </ModalContent>
    );
  }
}
