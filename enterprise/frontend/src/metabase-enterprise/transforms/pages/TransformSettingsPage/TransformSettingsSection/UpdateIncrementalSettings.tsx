import _ from "underscore";

import { Form, FormInlineUpdater, FormProvider } from "metabase/forms";
import {
  IncrementalTransformSettings,
  useUpdateIncrementalSettings,
} from "metabase-enterprise/transforms/components/IncrementalTransform";
import type { Transform } from "metabase-types/api";

type Props = {
  transform: Transform;
};

export const UpdateIncrementalSettings = ({ transform }: Props) => {
  const { initialValues, validationSchema, update } =
    useUpdateIncrementalSettings(transform);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={_.noop}
    >
      <Form>
        <FormInlineUpdater update={update} />
        <IncrementalTransformSettings
          source={transform.source}
          checkOnMount
          variant="standalone"
        />
      </Form>
    </FormProvider>
  );
};
