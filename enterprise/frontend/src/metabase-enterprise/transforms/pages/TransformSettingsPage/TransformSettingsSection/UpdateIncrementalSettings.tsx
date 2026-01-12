import { useFormikContext } from "formik";
import { t } from "ttag";
import _ from "underscore";

import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { Transform } from "metabase-types/api";

import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "../../../components/IncrementalTransform";
import type { IncrementalSettingsFormValues } from "../../../components/IncrementalTransform/form";
import { useQueryComplexityChecks } from "../../../components/QueryComplexityWarning";

type UpdateIncrementalSettingsProps = {
  transform: Transform;
};

const IncrementalTransformSettingsWrapper = ({
  transform,
}: UpdateIncrementalSettingsProps) => {
  const { values, setFieldValue } =
    useFormikContext<IncrementalSettingsFormValues>();
  const { confirmIfQueryIsComplex, modal } = useQueryComplexityChecks();

  const handleIncrementalChange = async (value: boolean) => {
    if (value) {
      const confirmed = await confirmIfQueryIsComplex(transform.source);
      if (!confirmed) {
        return;
      }
    }
    setFieldValue("incremental", value);
  };

  return (
    <>
      <IncrementalTransformSettings
        source={transform.source}
        incremental={values.incremental}
        onIncrementalChange={handleIncrementalChange}
        variant="standalone"
      />
      {modal}
    </>
  );
};

export const UpdateIncrementalSettings = ({
  transform,
}: UpdateIncrementalSettingsProps) => {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const showSuccessToast = () =>
    sendSuccessToast(t`Incremental transformation settings updated`);

  const showErrorToast = () =>
    sendErrorToast(t`Failed to update incremental transformation settings`);

  const { initialValues, validationSchema, updateIncrementalSettings } =
    useUpdateIncrementalSettings(transform);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={_.noop}
      enableReinitialize
    >
      <Form>
        <FormInlineUpdater
          update={updateIncrementalSettings}
          onSuccess={showSuccessToast}
          onError={showErrorToast}
        />
        <IncrementalTransformSettingsWrapper transform={transform} />
      </Form>
    </FormProvider>
  );
};
