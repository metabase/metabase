import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import {
  Button,
  Group,
  List,
  Loader,
  Modal,
  Radio,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import {
  useExportChangesMutation,
  useGetExportPreflightQuery,
} from "metabase-enterprise/api";
import type {
  ExportPreflightResponse,
  RemoteSyncEntity,
} from "metabase-types/api";

import { trackPushChanges } from "../../../analytics";
import { useRemoteSyncDirtyState } from "../../../hooks";

type PushModalProps = {
  opened: boolean;
  branch: string;
  onClose: () => void;
};

type PushStrategy = "merge" | "overwrite";

type PushFormValues = {
  message: string;
  strategy: PushStrategy;
};

const PUSH_SCHEMA = Yup.object({
  message: Yup.string().trim().required(Errors.required),
  strategy: Yup.string().oneOf(["merge", "overwrite"]),
});

export const PushModal = ({ opened, branch, onClose }: PushModalProps) => (
  <Modal opened={opened} title={t`Push changes`} size="lg" onClose={onClose}>
    <ModalBody branch={branch} onClose={onClose} />
  </Modal>
);

type ModalBodyProps = {
  branch: string;
  onClose: () => void;
};

const ModalBody = ({ branch, onClose }: ModalBodyProps) => {
  const { dirty } = useRemoteSyncDirtyState();
  const { data: preflight, isFetching } = useGetExportPreflightQuery(
    { branch },
    { refetchOnMountOrArgChange: true },
  );
  const [exportChanges] = useExportChangesMutation();

  const handleSubmit = async ({ message, strategy }: PushFormValues) => {
    const isRemoteChanged = preflight?.has_changes ?? false;
    await exportChanges({
      branch,
      message,
      merge: isRemoteChanged && strategy === "merge",
      force: isRemoteChanged && strategy === "overwrite",
    }).unwrap();
    trackPushChanges({
      triggeredFrom: "app-bar",
      force: isRemoteChanged && strategy === "overwrite",
    });
    onClose();
  };

  if (isFetching || !preflight) {
    return <Loader />;
  }

  return (
    <FormProvider<PushFormValues>
      initialValues={{
        message: "",
        strategy: preflight.clean ? "merge" : "overwrite",
      }}
      validationSchema={PUSH_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <ChangesList dirty={dirty} />
          {preflight.has_changes && <RemoteChanges preflight={preflight} />}
          <FormTextarea name="message" label={t`Commit message`} />
          <FormErrorMessage />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Push`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
};

type ChangesListProps = {
  dirty: RemoteSyncEntity[];
};

const ChangesList = ({ dirty }: ChangesListProps) => (
  <Stack gap="xs">
    <Text fw="bold">{t`Changes`}</Text>
    <ScrollArea.Autosize mah="12rem">
      <List>
        {dirty.map((entity) => (
          <List.Item key={`${entity.model}-${entity.id}-${entity.name}`}>
            {entity.name}
          </List.Item>
        ))}
      </List>
    </ScrollArea.Autosize>
  </Stack>
);

type RemoteChangesProps = {
  preflight: ExportPreflightResponse;
};

const RemoteChanges = ({ preflight }: RemoteChangesProps) => {
  const casualties = [
    ...preflight.force_push_casualties.deleted,
    ...preflight.force_push_casualties.overwritten,
  ];

  return (
    <Stack gap="sm">
      <Text>{t`The branch changed since your last sync.`}</Text>
      <FormRadioGroup name="strategy">
        <Stack gap="sm">
          <Radio
            value="merge"
            label={t`Merge the branch changes and push`}
            description={
              preflight.clean
                ? t`Your changes and the branch changes don't overlap.`
                : t`Both changed: ${preflight.conflicts.join(", ")}`
            }
            disabled={!preflight.clean}
          />
          <Radio
            value="overwrite"
            label={t`Overwrite the branch with your content`}
            description={
              casualties.length > 0
                ? t`Discards branch changes to: ${casualties.join(", ")}`
                : undefined
            }
          />
        </Stack>
      </FormRadioGroup>
    </Stack>
  );
};
