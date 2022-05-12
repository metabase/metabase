/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

import entityType from "./EntityType";

export function getForm(entityDef) {
  // 1. default `form`
  // 2. first of the named `forms`
  return entityDef.form || Object.values(entityDef.forms)[0];
}

const EForm = ({
  entityDef,
  entityObject,
  form = getForm(entityDef),
  update,
  create,
  onSubmit = object => (object.id ? update(object) : create(object)),
  onSaved,
  ...props
}) => (
  <Form
    {...props}
    form={form}
    initialValues={entityObject}
    onSubmit={onSubmit}
    onSubmitSuccess={action => onSaved && onSaved(action.payload.object)}
  />
);

const Modal = ({
  children,
  title: titleProp,
  entityDef,
  entityObject,
  onClose,
}) => {
  const parseTitleFromEntity = () =>
    entityObject?.id
      ? entityDef.objectSelectors.getName(entityObject)
      : t`New ${entityDef.displayNameOne}`;

  const title = titleProp || parseTitleFromEntity();

  return (
    <ModalContent title={title} onClose={onClose}>
      {children}
    </ModalContent>
  );
};

class EntityForm extends React.Component {
  render() {
    const { modal, ...props } = this.props;

    const eForm = <EForm {...props} />;

    if (modal) {
      return <Modal {...this.props}>{eForm}</Modal>;
    } else {
      return eForm;
    }
  }
}

export default entityType()(EntityForm);
