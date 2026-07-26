import { useFormikContext } from "formik";
import { t } from "ttag";
import type { AnyObjectSchema } from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Group, Stack } from "metabase/ui";

import { BranchFormSelect } from "../BranchFormSelect";

export type WorkspaceBranchFormValues = {
  branch: string | null;
};

export type WorkspaceBranchFormProps = {
  branches: string[];
  initialBranch?: string | null;
  validationSchema: AnyObjectSchema;
  /** Label for the submit button, derived from the branch currently entered/selected. */
  getSubmitLabel: (branch: string | null) => string;
  onSubmit: (values: WorkspaceBranchFormValues) => Promise<void> | void;
  onCancel: () => void;
};

/**
 * Shared branch-picking form behind both the admin Create-workspace modal and the top-nav
 * Enter-workspace modal: a creatable {@link BranchFormSelect} plus a submit button whose label
 * reacts to the branch the user has entered (e.g. create-branch vs. enter-existing).
 */
export function WorkspaceBranchForm({
  branches,
  initialBranch = null,
  validationSchema,
  getSubmitLabel,
  onSubmit,
  onCancel,
}: WorkspaceBranchFormProps) {
  return (
    <FormProvider
      initialValues={{ branch: initialBranch }}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <Stack gap="xl">
          <BranchFormSelect name="branch" branches={branches} />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <WorkspaceBranchSubmitButton getSubmitLabel={getSubmitLabel} />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type WorkspaceBranchSubmitButtonProps = {
  getSubmitLabel: (branch: string | null) => string;
};

function WorkspaceBranchSubmitButton({
  getSubmitLabel,
}: WorkspaceBranchSubmitButtonProps) {
  const { values } = useFormikContext<WorkspaceBranchFormValues>();
  return (
    <FormSubmitButton variant="filled" label={getSubmitLabel(values.branch)} />
  );
}
