import { t } from "ttag";
import * as Yup from "yup";

import { getErrorMessage } from "metabase/api/utils";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Button,
  FocusTrap,
  Group,
  List,
  Loader,
  Modal,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import {
  useExportChangesMutation,
  useGetExportPreflightQuery,
  useGetRemoteSyncChangesQuery,
} from "metabase-enterprise/api";
import type { ExportPreflightResponse } from "metabase-types/api";

import { trackPushChanges } from "../../../analytics";
import type { SyncTask } from "../types";

import { ChangesList } from "./ChangesList";
import { getDefaultCommitMessage } from "./utils";

type PushModalProps = {
  opened: boolean;
  branch: string;
  onTaskStarted: (task: SyncTask) => void;
  onClose: () => void;
};

type PushStrategy = "merge" | "overwrite";

type PushFormValues = {
  message: string;
  strategy: PushStrategy;
};

function getPushSchema() {
  return Yup.object({
    message: Yup.string(),
    strategy: Yup.string().oneOf(["merge", "overwrite"]),
  });
}

export function PushModal({
  opened,
  branch,
  onTaskStarted,
  onClose,
}: PushModalProps) {
  return (
    <Modal opened={opened} title={t`Push changes`} size="lg" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <PushModalBody
        branch={branch}
        onTaskStarted={onTaskStarted}
        onClose={onClose}
      />
    </Modal>
  );
}

type PushModalBodyProps = {
  branch: string;
  onTaskStarted: (task: SyncTask) => void;
  onClose: () => void;
};

function PushModalBody({ branch, onTaskStarted, onClose }: PushModalBodyProps) {
  const applicationName = useSelector(getApplicationName);
  const defaultMessage = getDefaultCommitMessage(applicationName);
  const {
    data: changes,
    error: changesError,
    isFetching: isFetchingChanges,
  } = useGetRemoteSyncChangesQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const {
    data: preflight,
    error: preflightError,
    isFetching: isFetchingPreflight,
  } = useGetExportPreflightQuery(
    { branch },
    { refetchOnMountOrArgChange: true },
  );
  const [exportChanges] = useExportChangesMutation();
  const error = changesError ?? preflightError;

  if (error) {
    return (
      <Text c="feedback-negative">
        {getErrorMessage(error, t`Couldn't check the changes to push`)}
      </Text>
    );
  }

  if (isFetchingChanges || isFetchingPreflight || !changes || !preflight) {
    return <Loader />;
  }

  const handleSubmit = async ({ message, strategy }: PushFormValues) => {
    const isForce = preflight.has_changes && strategy === "overwrite";
    const { task_id } = await exportChanges({
      branch,
      message: message.trim() || defaultMessage,
      merge: preflight.has_changes && strategy === "merge",
      force: isForce,
    }).unwrap();
    trackPushChanges({ triggeredFrom: "app-bar", force: isForce });
    onTaskStarted({ id: task_id, title: t`Pushing changes` });
  };

  return (
    <FormProvider<PushFormValues>
      initialValues={{
        message: "",
        strategy: preflight.clean ? "merge" : "overwrite",
      }}
      validationSchema={getPushSchema()}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <ChangesList entities={changes.dirty} />
          {preflight.has_changes && <RemoteChanges preflight={preflight} />}
          <FormTextarea
            name="message"
            label={t`Commit message`}
            placeholder={defaultMessage}
          />
          <FormErrorMessage />
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Push`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type RemoteChangesProps = {
  preflight: ExportPreflightResponse;
};

function RemoteChanges({ preflight }: RemoteChangesProps) {
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
              preflight.clean ? (
                t`Your changes and the branch changes don't overlap.`
              ) : (
                <LabelList
                  title={t`Changed both here and on the branch:`}
                  labels={preflight.conflicts}
                />
              )
            }
            disabled={!preflight.clean}
          />
          <Radio
            value="overwrite"
            label={t`Overwrite the branch with your content`}
            description={
              casualties.length > 0 ? (
                <LabelList
                  title={t`Discards the branch changes to:`}
                  labels={casualties}
                />
              ) : undefined
            }
          />
        </Stack>
      </FormRadioGroup>
    </Stack>
  );
}

type LabelListProps = {
  title: string;
  labels: string[];
};

function LabelList({ title, labels }: LabelListProps) {
  return (
    <Stack gap="xs">
      <Text c="inherit" fz="inherit">
        {title}
      </Text>
      <List size="sm">
        {labels.map((label, index) => (
          <List.Item key={`${label}-${index}`}>{label}</List.Item>
        ))}
      </List>
    </Stack>
  );
}
