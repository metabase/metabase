import { useCallback } from "react";
import _ from "underscore";

import { Form, FormObserver, FormProvider } from "metabase/forms";
import {
  type IncrementalSettingsFormValues,
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase-enterprise/transforms/components/IncrementalTransform";
import type { Transform } from "metabase-types/api";

type Props = {
  transform: Transform;
  onUpdate?: () => void;
};

export const UpdateIncrementalSettings = ({ transform, onUpdate }: Props) => {
  const { initialValues, validationSchema } =
    useUpdateIncrementalSettings(transform);

  // const handleSubmit = async (values: IncrementalSettingsFormValues) => {
  //   try {
  //     await update(values);
  //     onUpdate?.();
  //   } catch (err) {}
  // };

  const handleChange = useCallback(
    (values: IncrementalSettingsFormValues) => {
      if (values.incremental) {
        onUpdate?.();
      }
    },
    [onUpdate],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={_.noop}
    >
      <Form>
        <FormObserver onChange={handleChange} />
        <IncrementalTransformSettings
          source={transform.source}
          checkOnMount
          variant="standalone"
        />
      </Form>
    </FormProvider>
  );
};
