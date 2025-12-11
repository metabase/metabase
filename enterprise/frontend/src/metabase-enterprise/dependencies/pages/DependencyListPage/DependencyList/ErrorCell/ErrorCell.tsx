import { useDisclosure } from "@mantine/hooks";

import { Anchor, Group, List, Modal } from "metabase/ui";
import type { DependencyError, DependencyNode } from "metabase-types/api";

import { getNodeLabel } from "../../../../utils";

import { getErrorCountMessage, getErrorLabel, getErrorMessage } from "./utils";

type ErrorCellProps = {
  node: DependencyNode;
};

export function ErrorCell({ node }: ErrorCellProps) {
  const errors = node.errors ?? [];
  const [isOpened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Group>
        <Anchor role="button" onClick={open}>
          {getErrorCountMessage(errors)}
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
  const label = getErrorLabel(error.type);
  const message = getErrorMessage(error);

  return (
    <List.Item>
      {label} {message && <strong>{message}</strong>}
    </List.Item>
  );
}
