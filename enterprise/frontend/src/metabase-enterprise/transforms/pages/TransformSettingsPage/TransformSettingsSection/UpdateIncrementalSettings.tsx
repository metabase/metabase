import { Form, FormProvider } from "metabase/forms";
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
  const { initialValues, validationSchema, update } =
    useUpdateIncrementalSettings(transform);

  const handleSubmit = async (values: IncrementalSettingsFormValues) => {
    try {
      await update(values);
      onUpdate?.();
    } catch (err) {}
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <IncrementalTransformSettings source={transform.source} checkOnMount />
      </Form>
    </FormProvider>
  );
};
