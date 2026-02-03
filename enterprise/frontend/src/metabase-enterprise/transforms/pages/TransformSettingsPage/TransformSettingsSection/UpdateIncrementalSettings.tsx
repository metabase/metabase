import { useFormikContext } from "formik";
import { t } from "ttag";
import _ from "underscore";

import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { IncrementalSettingsFormValues } from "metabase-enterprise/transforms/components/IncrementalTransform";
import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase-enterprise/transforms/components/IncrementalTransform";
import { useQueryComplexityChecks } from "metabase-enterprise/transforms/components/QueryComplexityWarning";
import type { Transform } from "metabase-types/api";

type UpdateIncrementalSettingsProps = {
  transform: Transform;
  readOnly?: boolean;
};

const IncrementalTransformSettingsWrapper = ({
  transform,
  readOnly,
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
        readOnly={readOnly}
      />
      {modal}
    </>
  );
};

export const UpdateIncrementalSettings = ({
  transform,
  readOnly,
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
        <IncrementalTransformSettingsWrapper
          transform={transform}
          readOnly={readOnly}
        />
      </Form>
    </FormProvider>
  );
};
