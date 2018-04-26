import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "rebass";
import { t } from "c-3po";

import ModalContent from "metabase/components/ModalContent.jsx";

import Button from "metabase/components/Button.jsx";
import FormField from "metabase/components/FormField.jsx";
import Select, { Option } from "metabase/components/Select.jsx";

import CollectionListLoader from "metabase/components/CollectionListLoader";

export default class CreateDashboardModal extends Component {
  constructor(props, context) {
    super(props, context);
    this.createNewDash = this.createNewDash.bind(this);
    this.setDescription = this.setDescription.bind(this);
    this.setName = this.setName.bind(this);

    this.state = {
      name: null,
      description: null,
      errors: null,
      collection_id: null,
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
            primary={formReady}
            disabled={!formReady}
            onClick={this.createNewDash}
          >{t`Create`}</Button>,
        ]}
        onClose={this.props.onClose}
      >
        <form className="Modal-form" onSubmit={this.createNewDash}>
          <div className="Form-inputs">
            <FormField
              displayName={t`Name`}
              fieldName="name"
              errors={this.state.errors}
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
              displayName={t`Description`}
              fieldName="description"
              errors={this.state.errors}
            >
              <input
                className="Form-input full"
                name="description"
                placeholder={t`It's optional but oh, so helpful`}
                value={this.state.description}
                onChange={this.setDescription}
              />
            </FormField>
            <CollectionListLoader>
              {({ collections, error, loading }) => {
                if (loading) {
                  return <Box>Loading...</Box>;
                }
                return (
                  <FormField
                    displayName={t`Which collection should this go in?`}
                    fieldName="collection_id"
                    errors={this.state.errors}
                  >
                    <Select
                      value={this.state.collection_id}
                      onChange={({ target }) =>
                        this.setState({ collection_id: target.value })
                      }
                    >
                      {[{ name: t`None`, id: null }]
                        .concat(collections)
                        .map((collection, index) => (
                          <Option
                            key={index}
                            value={collection.id}
                            icon={collection.id != null ? "collection" : null}
                            iconColor={collection.color}
                            iconSize={18}
                          >
                            {collection.name}
                          </Option>
                        ))}
                    </Select>
                  </FormField>
                );
              }}
            </CollectionListLoader>
          </div>
        </form>
      </ModalContent>
    );
  }
}
