import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase-enterprise/transforms/components/IncrementalTransform";
import type { Transform } from "metabase-types/api";

type Props = {
  transform: Transform;
};

export const UpdateIncrementalSettings = ({ transform }: Props) => {
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { initialValues, validationSchema, update } =
    useUpdateIncrementalSettings(transform);

  const showSuccessToast = useCallback(() => {
    sendSuccessToast(t`Incremental transformation settings updated`);
  }, [sendSuccessToast]);

  const showErrorToast = useCallback(() => {
    sendErrorToast(t`Failed to update incremental transformation settings`);
  }, [sendErrorToast]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={_.noop}
    >
      <Form>
        <FormInlineUpdater
          update={update}
          onSuccess={showSuccessToast}
          onError={showErrorToast}
        />
        <IncrementalTransformSettings
          source={transform.source}
          checkOnMount
          variant="standalone"
        />
      </Form>
    </FormProvider>
  );
};
