import { useDisclosure } from "@mantine/hooks";

import { Anchor, Group, List, Modal } from "metabase/ui";
import type { DependencyError, DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../../../utils";

import { getErrorDetail, getErrorTypeLabel, getErrorsInfo } from "./utils";

type ErrorsCellProps = {
  node: DependencyNode;
};

export function ErrorsCell({ node }: ErrorsCellProps) {
  const errors = node.errors ?? [];
  const errorsInfo = getErrorsInfo(errors);
  const [isOpened, { open, close }] = useDisclosure(false);

  if (!errorsInfo) {
    return null;
  }

  return (
    <>
      <Group>
        <Anchor role="button" onClick={open}>
          {errorsInfo.label}{" "}
          {errorsInfo.detail && <strong>{errorsInfo.detail}</strong>}
        </Anchor>
      </Group>
      <Modal title={getNodeLabel(node)} opened={isOpened} onClose={close}>
        <ErrorList errors={errors} />
      </Modal>
    </>
  );
}

type ErrorListProps = {
  errors: DependencyError[];
};

function ErrorList({ errors }: ErrorListProps) {
  return (
    <List spacing="sm">
      {errors.map((error, errorIndex) => (
        <ErrorListItem key={errorIndex} error={error} />
      ))}
    </List>
  );
}

type ErrorListItemProps = {
  error: DependencyError;
};

function ErrorListItem({ error }: ErrorListItemProps) {
  const label = getErrorTypeLabel(error.type);
  const detail = getErrorDetail(error);

  return (
    <List.Item>
      {label} {detail && <strong>{detail}</strong>}
    </List.Item>
  );
}
