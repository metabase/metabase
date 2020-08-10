import React from "react";
import PropTypes from "prop-types";

import FormField from "metabase/components/form/FormField";
import FormWidget from "metabase/components/form/FormWidget";
import FormMessage from "metabase/components/form/FormMessage";

import DisclosureTriangle from "metabase/components/DisclosureTriangle";

import Button from "metabase/components/Button";
import ActionButton from "metabase/components/ActionButton";

import _ from "underscore";
import cx from "classnames";

import { t } from "ttag";
import { getIn } from "icepick";

class CustomForm extends React.Component {
  static childContextTypes = {
    handleSubmit: PropTypes.func,
    submitTitle: PropTypes.string,
    renderSubmit: PropTypes.func,
    className: PropTypes.string,
    style: PropTypes.object,
    fields: PropTypes.object,
    formFields: PropTypes.array,
    formFieldsByName: PropTypes.object,
    values: PropTypes.object,
    submitting: PropTypes.bool,
    invalid: PropTypes.bool,
    pristine: PropTypes.bool,
    error: PropTypes.string,
    onChangeField: PropTypes.func,
  };

  getChildContext() {
    const {
      fields,
      values,
      formObject: form,
      submitting,
      invalid,
      pristine,
      error,
      handleSubmit,
      submitTitle,
      renderSubmit,
      className,
      style,
      onChangeField,
    } = this.props;
    const formFields = form.fields(values);
    const formFieldsByName = _.indexBy(formFields, "name");

    return {
      handleSubmit,
      submitTitle,
      renderSubmit,
      className,
      style,
      fields,
      formFields,
      formFieldsByName,
      values,
      submitting,
      invalid,
      pristine,
      error,
      onChangeField,
    };
  }

  render() {
    const { formObject: form, values, children } = this.props;
    if (typeof children === "function") {
      return children({
        ...this.props,
        form: form,
        formFields: form.fields(values),
        Form: Form,
        FormField: CustomFormField,
        FormSubmit: CustomFormSubmit,
        FormMessage: CustomFormMessage,
        FormFooter: CustomFormFooter,
      });
    } else {
      return <Form formRef={form => (this._formRef = form)}>{children}</Form>;
    }
  }
}

const Form = ({ children, formRef }, { handleSubmit, className, style }) => (
  <form
    onSubmit={handleSubmit}
    ref={formRef}
    className={className}
    style={style}
  >
    {children}
  </form>
);
Form.contextTypes = {
  handleSubmit: PropTypes.func,
  className: PropTypes.string,
  style: PropTypes.object,
};

export class CustomFormField extends React.Component {
  static contextTypes = {
    fields: PropTypes.object,
    formFieldsByName: PropTypes.object,
    values: PropTypes.object,
    onChangeField: PropTypes.func,
    registerFormField: PropTypes.func,
    unregisterFormField: PropTypes.func,
  };
  _getFieldDefinition() {
    return _.pick(
      this.props,
      "name",
      "type",
      "title",
      "description",
      "initial",
      "validate",
      "normalize",
    );
  }
  componentWillMount() {
    if (this.context.registerFormField) {
      this.context.registerFormField(this._getFieldDefinition());
    }
  }
  componentWillUnmount() {
    if (this.context.unregisterFormField) {
      this.context.unregisterFormField(this._getFieldDefinition());
    }
  }
  render() {
    const { name } = this.props;
    const { fields, formFieldsByName, values, onChangeField } = this.context;

    const field = getIn(fields, name.split("."));
    const formField = formFieldsByName[name];
    if (!field || !formField) {
      return null;
    }

    const props = {
      ...this.props,
      values,
      onChangeField,
      field,
      formField,
    };

    return (
      <FormField {...props}>
        <FormWidget {...props} />
      </FormField>
    );
  }
}

export const CustomFormSubmit = (
  { children, ...props },
  {
    values,
    submitting,
    invalid,
    pristine,
    handleSubmit,
    submitTitle,
    renderSubmit,
  },
) => {
  const title = children || submitTitle || t`Submit`;
  // NOTE: need a way to configure if "pristine" forms can be submitted
  const canSubmit = !(submitting || invalid); // || pristine );
  if (renderSubmit) {
    return renderSubmit({ canSubmit, title, handleSubmit });
  } else {
    return (
      <ActionButton
        normalText={title}
        activeText={title}
        failedText={t`Failed`}
        successText={t`Success`}
        primary={canSubmit}
        disabled={!canSubmit}
        {...props}
        type="submit"
        actionFn={handleSubmit}
      />
    );
  }
};
CustomFormSubmit.contextTypes = {
  values: PropTypes.object,
  submitting: PropTypes.bool,
  invalid: PropTypes.bool,
  pristine: PropTypes.bool,
  handleSubmit: PropTypes.func,
  submitTitle: PropTypes.string,
  renderSubmit: PropTypes.func,
};

export const CustomFormMessage = (props, { error }) =>
  error ? <FormMessage message={error} formError /> : null;
CustomFormMessage.contextTypes = {
  error: PropTypes.string,
};

export default CustomForm;

const StandardSection = ({ title, children }) => (
  <section className="mb4">
    {title && <h2 className="mb2">{title}</h2>}
    {children}
  </section>
);

class CollapsibleSection extends React.Component {
  state = {
    show: false,
  };

  handleToggle = () => {
    this.setState(previousState => ({
      show: !previousState.show,
    }));
  };
  render() {
    const { title, children } = this.props;
    const { show } = this.state;
    return (
      <section className="mb4">
        <div
          className="mb2 flex align-center cursor-pointer text-brand-hover"
          onClick={this.handleToggle}
        >
          <DisclosureTriangle className="mr1" open={show} />
          <h3>{title}</h3>
        </div>
        <div className={show ? null : "hide"}>{children}</div>
      </section>
    );
  }
}

export const CustomFormSection = ({ collapsible, ...props }) =>
  collapsible ? (
    <CollapsibleSection {...props} />
  ) : (
    <StandardSection {...props} />
  );

export const CustomFormFooter = (
  { submitTitle, cancelTitle = t`Cancel`, onCancel, footerExtraButtons },
  { isModal },
) => {
  return (
    <div className={cx("flex align-center", { "flex-reverse": isModal })}>
      <CustomFormSubmit>{submitTitle}</CustomFormSubmit>
      {onCancel && (
        <Button className="mx1" onClick={onCancel}>
          {cancelTitle}
        </Button>
      )}
      <div className="flex-full" />
      <CustomFormMessage />
      {footerExtraButtons}
    </div>
  );
};

CustomFormFooter.contextTypes = {
  isModal: PropTypes.bool,
};
