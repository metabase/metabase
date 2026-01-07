import { t } from "ttag";
import _ from "underscore";

import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { Transform } from "metabase-types/api";

import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "../../../components/IncrementalTransform";

type UpdateIncrementalSettingsProps = {
  transform: Transform;
  readOnly?: boolean;
};

export const UpdateIncrementalSettings = ({
  transform,
  readOnly,
}: UpdateIncrementalSettingsProps) => {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { initialValues, validationSchema, updateIncrementalSettings } =
    useUpdateIncrementalSettings(transform);

  const showSuccessToast = () =>
    sendSuccessToast(t`Incremental transformation settings updated`);

  const showErrorToast = () =>
    sendErrorToast(t`Failed to update incremental transformation settings`);

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
        <IncrementalTransformSettings
          source={transform.source}
          checkOnMount
          variant="standalone"
          readOnly={readOnly}
        />
      </Form>
    </FormProvider>
  );
};
