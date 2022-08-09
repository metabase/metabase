import React from "react";
import { Formik } from "formik";
import type { FormikErrors } from "formik";
import { t } from "ttag";
import { Metric } from "metabase-types/api";
import FormLabel from "../FormLabel/FormLabel";
import FormInput from "../FormInput/FormInput";
import FormTextArea from "../FormTextArea/FormTextArea";

export interface MetricFormProps {
  metric?: Metric;
  onSubmit: (values: Partial<Metric>) => void;
}

const MetricForm = ({ metric, onSubmit }: MetricFormProps): JSX.Element => {
  return (
    <Formik
      initialValues={metric ?? {}}
      validate={validate}
      onSubmit={onSubmit}
    >
      {({ handleSubmit }) => (
        <form className="full" onSubmit={handleSubmit}>
          <div className="wrapper py4">
            <div style={{ maxWidth: "575px" }}>
              <FormLabel
                title={t`Name Your Metric`}
                description={t`Give your metric a name to help others find it.`}
              >
                <FormInput
                  name="name"
                  placeholder={t`Something descriptive but not too long`}
                />
              </FormLabel>
              <FormLabel
                title={t`Describe Your Metric`}
                description={t`Give your metric a description to help others understand what it's about.`}
              >
                <FormTextArea
                  name="description"
                  placeholder={t`This is a good place to be more specific about less obvious metric rules`}
                />
              </FormLabel>
            </div>
          </div>
        </form>
      )}
    </Formik>
  );
};

const validate = (values: Partial<Metric>) => {
  const errors: FormikErrors<Metric> = {};

  if (!values.name) {
    errors.name = t`Name is required`;
  }

  if (!values.description) {
    errors.description = t`Description is required`;
  }

  if (values.id != null && !values.revision_message) {
    errors.revision_message = t`Revision message is required`;
  }

  return errors;
};
