import { useField } from "formik";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import {
  Box,
  Button,
  FocusTrap,
  Group,
  Modal,
  SelectItem,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useCreateBranchMutation,
  useCreateWorktreeMutation,
  useGetRemoteSyncBranchesQuery,
} from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

const getValidationSchema = () =>
  Yup.object({
    branch: Yup.string().required(Errors.required),
  });

type CreateWorktreeValues = Yup.InferType<
  ReturnType<typeof getValidationSchema>
>;

const INITIAL_VALUES: CreateWorktreeValues = { branch: "" };

type CreateWorktreeModalProps = {
  opened: boolean;
  onCreate: (worktree: RemoteSyncWorktree) => void;
  onClose: () => void;
};

export function CreateWorktreeModal({
  opened,
  onCreate,
  onClose,
}: CreateWorktreeModalProps) {
  return (
    <Modal opened={opened} title={t`New worktree`} onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateWorktreeForm onCreate={onCreate} onClose={onClose} />
    </Modal>
  );
}

type CreateWorktreeFormProps = {
  onCreate: (worktree: RemoteSyncWorktree) => void;
  onClose: () => void;
};

function CreateWorktreeForm({ onCreate, onClose }: CreateWorktreeFormProps) {
  const { data, isLoading } = useGetRemoteSyncBranchesQuery();
  const [createBranch] = useCreateBranchMutation();
  const [createWorktree] = useCreateWorktreeMutation();
  const branches = useMemo(() => data?.items ?? [], [data]);
  const validationSchema = useMemo(getValidationSchema, []);

  const handleSubmit = async ({ branch }: CreateWorktreeValues) => {
    if (!branches.includes(branch)) {
      await createBranch({ name: branch }).unwrap();
    }
    const worktree = await createWorktree({ branch }).unwrap();
    onCreate(worktree);
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <BranchSelect branches={branches} isLoading={isLoading} />
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Create worktree`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type BranchSelectProps = {
  branches: string[];
  isLoading: boolean;
};

function BranchSelect({ branches, isLoading }: BranchSelectProps) {
  const [{ value }] = useField<string>("branch");
  const [searchValue, setSearchValue] = useState(value);
  const newBranchName = searchValue.trim();
  const options = _.uniq([
    ...branches,
    ...(newBranchName !== "" ? [newBranchName] : []),
  ]);
  const isNewBranch = value !== "" && !branches.includes(value);

  return (
    <Stack gap="sm">
      <FormSelect
        name="branch"
        label={t`Branch`}
        placeholder={
          isLoading ? t`Loading branches…` : t`Pick or type a branch`
        }
        data={options}
        searchable
        searchValue={searchValue}
        nothingFoundMessage={t`No branches found`}
        disabled={isLoading}
        renderOption={({ option }) =>
          branches.includes(option.value) ? (
            <SelectItem>{option.value}</SelectItem>
          ) : (
            <NewBranchItem name={option.value} />
          )
        }
        onSearchChange={setSearchValue}
      />
      {isNewBranch && (
        <Text size="sm" c="text-secondary">
          {t`This branch will be created from the main branch.`}
        </Text>
      )}
    </Stack>
  );
}

type NewBranchItemProps = {
  name: string;
};

function NewBranchItem({ name }: NewBranchItemProps) {
  return (
    <SelectItem>
      <Text c="inherit" lh="inherit">
        {jt`Create new branch ${<strong key="name">{name}</strong>}`}
      </Text>
    </SelectItem>
  );
}
