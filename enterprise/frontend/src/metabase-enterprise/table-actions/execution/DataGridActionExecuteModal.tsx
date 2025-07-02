import cx from "classnames";
import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import type { DataGridRowAction } from "metabase/data-grid/types";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Center, Flex, Loader, Modal } from "metabase/ui";
import {
  useDescribeActionFormMutation,
  useExecuteActionMutation,
} from "metabase-enterprise/api";
import { ModalParameterActionInput } from "metabase-enterprise/data_editing/tables/edit/inputs_v2/ModalParameterActionInput";
import { ActionFormModalParameter } from "metabase-enterprise/data_editing/tables/edit/modals/ActionFormModalParameter";
import type { RowCellsWithPkValue } from "metabase-enterprise/data_editing/tables/types";
import type { ActionScope } from "metabase-types/api";

import S from "./DataGridActionExecuteModal.module.css";
import { useTableActionForm } from "./use-table-action-form";

interface DataGridActionExecuteModalProps {
  action?: DataGridRowAction;
  actionInput?: RowCellsWithPkValue;
  scope: ActionScope;
  onClose: () => void;
}

type FormData = Record<string, string | number | boolean | null>;

export function DataGridActionExecuteModal({
  action,
  actionInput,
  scope,
  onClose,
}: DataGridActionExecuteModalProps) {
  const dispatch = useDispatch();

  const [fetchFormDescription, { data: description, isLoading }] =
    useDescribeActionFormMutation();

  const [executeAction, { isLoading: isExecuting }] =
    useExecuteActionMutation();

  const onSubmit = useCallback(
    async (values: FormData) => {
      if (!actionInput || !action) {
        return;
      }

      const result = await executeAction({
        actionId: action.id,
        input: actionInput,
        scope,
        params: values,
      });

      if (result.error) {
        dispatch(addUndo({ message: getActionErrorMessage(result.error) }));
      } else {
        dispatch(addUndo({ message: t`Successfully updated` }));
        onClose();
      }
    },
    [executeAction, dispatch, onClose, action, actionInput, scope],
  );

  const { isValid, resetForm, setFieldValue, handleSubmit, validateForm } =
    useTableActionForm<FormData>({
      description,
      onSubmit,
    });

  // Fetch the modal description on modal open
  useEffect(() => {
    if (action) {
      fetchFormDescription({
        action_id: action.id,
        input: actionInput,
        scope,
      });
    }
  }, [action, actionInput, fetchFormDescription, scope]);

  // Reset form and revalidate when description changes
  useEffect(() => {
    if (description) {
      resetForm();
      validateForm();
    }
  }, [description, resetForm, validateForm]);

  const hasParameters = description && description.parameters.length > 0;

  const loader = useMemo(() => {
    return (
      <Modal.Body px="xl">
        <Center pb="xl">
          <Loader />
        </Center>
      </Modal.Body>
    );
  }, []);

  return (
    <Modal.Root
      opened={!!action}
      data-testid="data-grid-action-execute-modal"
      onClose={onClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header
          px="xl"
          pb="0"
          className={cx(S.modalHeader, {
            [S.withoutParameters]: !hasParameters,
          })}
        >
          <Modal.Title>{action?.name}</Modal.Title>
          <Modal.CloseButton onClick={onClose} />
        </Modal.Header>
        {isLoading || !description ? (
          loader
        ) : (
          <form onSubmit={handleSubmit}>
            {hasParameters && (
              <Modal.Body px="xl" py="lg" className={cx(S.modalBody)}>
                {description.parameters.map((parameter) => {
                  return (
                    <ActionFormModalParameter
                      key={parameter.id}
                      parameter={parameter}
                    >
                      <ModalParameterActionInput
                        initialValue={parameter.value?.toString()}
                        parameter={parameter}
                        onChange={(value) => {
                          setFieldValue(parameter.id, value);
                        }}
                      />
                    </ActionFormModalParameter>
                  );
                })}
              </Modal.Body>
            )}
            <Flex
              px="xl"
              className={cx(S.modalFooter, {
                [S.withoutParameters]: !hasParameters,
              })}
              gap="lg"
              justify="flex-end"
            >
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                type="submit"
                disabled={!isValid || isExecuting}
              >
                {t`Submit`}
              </Button>
            </Flex>
          </form>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
