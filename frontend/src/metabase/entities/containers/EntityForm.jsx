/* eslint-disable react/prop-types */
import { Component, lazy, Suspense } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import entityType from "./EntityType";
const Form = lazy(() => import("metabase/containers/FormikForm"));

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
  resumedValues,
  ...props
}) => {
  const initialValues =
    typeof entityObject?.getPlainObject === "function"
      ? entityObject.getPlainObject()
      : entityObject;
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <Form
        {...props}
        form={form}
        initialValues={{ ...initialValues, ...resumedValues }}
        onSubmit={onSubmit}
        onSubmitSuccess={action => onSaved && onSaved(action.payload.object)}
      />
    </Suspense>
  );
};

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

class EntityForm extends Component {
  render() {
    const { modal, ...props } = this.props;

    if (modal) {
      return (
        <Modal {...this.props}>
          <EForm {...props} isModal />
        </Modal>
      );
    } else {
      return <EForm {...props} />;
    }
  }
}

export default entityType()(EntityForm);
