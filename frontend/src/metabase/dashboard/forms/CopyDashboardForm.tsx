import { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormFooter from "metabase/core/components/FormFooter";
import {
  Form,
  FormProvider,
  FormTextInput,
  FormErrorMessage,
  FormTextarea as FormTextArea,
  FormCheckbox,
} from "metabase/forms";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";

import * as Errors from "metabase/lib/errors";

import Collections from "metabase/entities/collections";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";

import { Button, Flex, Text, Tooltip } from "metabase/ui";

import type { CollectionId, Dashboard } from "metabase-types/api";
import type { FilterItemsInPersonalCollection } from "metabase/containers/ItemPicker";
import { Icon } from "metabase/core/components/Icon";
import { useSelector } from "metabase/lib/redux";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  collection_id: Yup.number().nullable(),
  is_shallow_copy: Yup.boolean().default(false),
});

export interface CopyDashboardProperties {
  name: string;
  description: string | null;
  collection_id: CollectionId;
  is_shallow_copy: boolean;
}

export interface CopyDashboardFormOwnProps {
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  onCopy: (dashboard: CopyDashboardProperties) => void;
  onCancel?: () => void;
  initialValues?: CopyDashboardProperties | null;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
}
interface CreateDashboardFormDispatchProps {
  handleCreateDashboard: (
    dashboard: CopyDashboardProperties,
  ) => Promise<Dashboard>;
}

type Props = CopyDashboardFormOwnProps & CreateDashboardFormDispatchProps;

export const CopyDashboardForm = ({
  onCancel,
  onCopy,
  initialValues,
  filterPersonalCollections,
  ...rest
}: Props) => {
  const initialCollectionId = useSelector<CollectionId>(state =>
    Collections.selectors.getInitialCollectionId(state, rest),
  );

  const computedInitialValues = useMemo(
    () => ({
      ...DASHBOARD_SCHEMA.getDefault(),
      collection_id: initialCollectionId,
      ...initialValues,
    }),
    [initialCollectionId, initialValues],
  );

  const handleCopy = useCallback(
    async (values: CopyDashboardProperties) => {
      onCopy(values);
    },
    [onCopy],
  );

  return (
    <FormProvider
      initialValues={computedInitialValues}
      validationSchema={DASHBOARD_SCHEMA}
      enableReinitialize
      onSubmit={handleCopy}
    >
      {() => (
        <Form>
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={t`What is the name of your dashboard?`}
            autoFocus
            mb="1rem"
          />
          <FormTextArea
            name="description"
            label={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
            mb="1rem"
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
            filterPersonalCollections={filterPersonalCollections}
          />
          <FormCheckbox
            name="is_shallow_copy"
            label={
              <Flex align="center">
                <Text mr="0.25rem">{t`Only duplicate the dashboard`}</Text>
                <Tooltip
                  label={t`If you check this, the cards in the duplicated dashboard will reference the original questions.`}
                  width={375}
                  multiline
                >
                  <Icon name="info" size={18} />
                </Tooltip>
              </Flex>
            }
          />
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && <Button onClick={onCancel}>{t`Cancel`}</Button>}
            <FormSubmitButton title={t`Create`} primary />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
};
