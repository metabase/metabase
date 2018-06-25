import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import FormField from "metabase/components/form/FormField.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import Button from "metabase/components/Button.jsx";
import CollectionSelect from "metabase/containers/CollectionSelect.jsx";

import Dashboards from "metabase/entities/dashboards";

const mapDispatchToProps = {
  createDashboard: Dashboards.actions.create,
};

@connect(null, mapDispatchToProps)
@withRouter
export default class CreateDashboardModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.createNewDash = this.createNewDash.bind(this);
    this.setDescription = this.setDescription.bind(this);
    this.setName = this.setName.bind(this);

    console.log(props.params);
    this.state = {
      name: null,
      description: null,
      errors: null,
      // collectionId in the url starts off as a string, but the select will
      // compare it to the integer ID on colleciton objects
      collection_id: parseInt(props.params.collectionId),
    };
  }

  static propTypes = {
    createDashboard: PropTypes.func.isRequired,
    onClose: PropTypes.func,
  };

  setName(event) {
    this.setState({ name: event.target.value });
  }

  setDescription(event) {
    this.setState({ description: event.target.value });
  }

  createNewDash(event) {
    event.preventDefault();

    let name = this.state.name && this.state.name.trim();
    let description = this.state.description && this.state.description.trim();

    // populate a new Dash object
    let newDash = {
      name: name && name.length > 0 ? name : null,
      description: description && description.length > 0 ? description : null,
      collection_id: this.state.collection_id,
    };

    this.props.createDashboard(newDash, { redirect: true });
    this.props.onClose();
  }

  render() {
    let formError;
    if (this.state.errors) {
      let errorMessage = t`Server error encountered`;
      if (this.state.errors.data && this.state.errors.data.message) {
        errorMessage = this.state.errors.data.message;
      }

      // TODO: timeout display?
      formError = <span className="text-error px2">{errorMessage}</span>;
    }

    let name = this.state.name && this.state.name.trim();

    let formReady = name !== null && name !== "";

    return (
      <ModalContent
        id="CreateDashboardModal"
        title={t`Create dashboard`}
        footer={[
          formError,
          <Button
            mr={1}
            onClick={() => this.props.onClose()}
          >{t`Cancel`}</Button>,
          <Button
            primary={formReady}
            disabled={!formReady}
            onClick={this.createNewDash}
          >{t`Create`}</Button>,
        ]}
        onClose={this.props.onClose}
      >
        <form className="Modal-form" onSubmit={this.createNewDash}>
          <div>
            <FormField
              name="name"
              displayName={t`Name`}
              formError={this.state.errors}
            >
              <input
                className="Form-input full"
                name="name"
                placeholder={t`What is the name of your dashboard?`}
                value={this.state.name}
                onChange={this.setName}
                autoFocus
              />
            </FormField>

            <FormField
              name="description"
              displayName={t`Description`}
              formError={this.state.errors}
            >
              <input
                className="Form-input full"
                name="description"
                placeholder={t`It's optional but oh, so helpful`}
                value={this.state.description}
                onChange={this.setDescription}
              />
            </FormField>

            <FormField
              displayName={t`Which collection should this go in?`}
              fieldName="collection_id"
              errors={this.state.errors}
            >
              <CollectionSelect
                value={this.state.collection_id}
                onChange={collection_id => this.setState({ collection_id })}
              />
            </FormField>
          </div>
        </form>
      </ModalContent>
    );
  }
}
