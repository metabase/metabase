import React, { Component } from "react";
import { t } from "c-3po";
import Button from "metabase/components/Button";
import ColorPicker from "metabase/components/ColorPicker";
import FormField from "metabase/components/form/FormField";
import Input from "metabase/components/Input";
import ModalContent from "metabase/components/ModalContent";
import { Box, Flex } from "grid-styled";

import { reduxForm } from "redux-form";

import { normal, getRandomColor } from "metabase/lib/colors";

const formConfig = {
  form: "collection",
  fields: ["id", "name", "description", "color"],
  validate: values => {
    const errors = {};
    if (!values.name) {
      errors.name = t`Name is required`;
    } else if (values.name.length > 100) {
      errors.name = t`Name must be 100 characters or less`;
    }
    if (!values.color) {
      errors.color = t`Color is required`;
    }
    return errors;
  },
  initialValues: {
    name: "",
    // the api expects nil or a non blank string for collection descriptions
    description: null,
    // pick a random color to start so everything isn't blue all the time
    color: getRandomColor(normal),
  },
};

export const getFormTitle = ({ id, name }) =>
  id.value ? name.value : t`New collection`;

export const getActionText = ({ id }) => (id.value ? t`Update` : t`Create`);

export const CollectionEditorFormActions = ({
  handleSubmit,
  invalid,
  onClose,
  fields,
}) => (
  <div>
    <Button className="mr1" onClick={onClose}>
      {t`Cancel`}
    </Button>
    <Button primary disabled={invalid} onClick={handleSubmit}>
      {getActionText(fields)}
    </Button>
  </div>
);

export class CollectionEditorForm extends Component {
  props: {
    fields: Object,
    onClose: Function,
    invalid: Boolean,
    handleSubmit: Function,
  };

  render() {
    const { fields, onClose } = this.props;
    return (
      <ModalContent title={getFormTitle(fields)} onClose={onClose}>
        <div
          className="NewForm ml-auto mr-auto mt4 pt2"
          style={{ width: "100%", maxWidth: 540 }}
        >
          <FormField displayName={t`Name`} {...fields.name}>
            <Input
              className="Form-input full"
              placeholder={t`My new fantastic collection`}
              autoFocus
              {...fields.name}
            />
          </FormField>
          <FormField displayName={t`Description`} {...fields.description}>
            <textarea
              className="Form-input full"
              placeholder={t`It's optional but oh, so helpful`}
              {...fields.description}
            />
          </FormField>
          <FormField displayName={t`Color`} {...fields.color}>
            <ColorPicker {...fields.color} />
          </FormField>
          <Flex align="center" py={2}>
            <Box ml="auto">
              <CollectionEditorFormActions {...this.props} />
            </Box>
          </Flex>
        </div>
      </ModalContent>
    );
  }
}

export default reduxForm(formConfig)(CollectionEditorForm);
