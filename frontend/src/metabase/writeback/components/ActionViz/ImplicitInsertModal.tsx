import React, { useCallback } from "react";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import { getMetadata } from "metabase/selectors/metadata";

import {
  createRowFromDataApp,
  InsertRowFromDataAppPayload,
} from "metabase/dashboard/actions";
import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";

import type { State } from "metabase-types/store";
import type Table from "metabase-lib/metadata/Table";

interface OwnProps {
  isOpen: boolean;
  tableId: Table["id"];
  onClose: () => void;
  children: React.ReactNode;
}

interface StateProps {
  table: Table | null;
}

interface DispatchProps {
  insertRow: (payload: InsertRowFromDataAppPayload) => void;
}

type ImplicitInsertModalProps = OwnProps & StateProps & DispatchProps;

function mapStateToProps(state: State, props: OwnProps) {
  const metadata = getMetadata(state);
  return {
    table: metadata.table(props.tableId),
  };
}

const mapDispatchToProps = {
  insertRow: createRowFromDataApp,
};

function ImplicitInsertModal({
  isOpen,
  table,
  insertRow,
  onClose,
  children,
}: ImplicitInsertModalProps) {
  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      if (table) {
        insertRow({
          table,
          values,
        });
      }
    },
    [table, insertRow],
  );

  return (
    <>
      {children}
      {table && (
        <Modal isOpen={isOpen} onClose={onClose}>
          <WritebackModalForm
            table={table}
            type="insert"
            mode="row"
            onSubmit={handleSubmit}
            onClose={onClose}
          />
        </Modal>
      )}
    </>
  );
}

export default connect<StateProps, DispatchProps, OwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(ImplicitInsertModal);
