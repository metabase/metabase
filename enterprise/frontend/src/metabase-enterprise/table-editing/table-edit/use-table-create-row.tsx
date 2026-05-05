import { useDisclosure } from "@mantine/hooks";

import { TableActionId, type TableEditingActionScope } from "../api/types";

import { useActionFormDescription } from "./use-table-action-form-description";

type UseTableCreateRowProps = {
  scope: TableEditingActionScope;
};

export function useTableCreateRow({ scope }: UseTableCreateRowProps) {
  const [
    isCreateRowModalOpen,
    { open: openCreateRowModal, close: closeCreateRowModal },
  ] = useDisclosure(false);

  const { data: formDescription } = useActionFormDescription({
    actionId: TableActionId.CreateRow,
    scope,
  });

  return {
    isCreateRowModalOpen,
    openCreateRowModal,
    closeCreateRowModal,
    formDescription,
  };
}
