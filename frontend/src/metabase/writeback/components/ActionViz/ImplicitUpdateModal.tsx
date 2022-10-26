import React from "react";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";

import {
  updateRowFromDataApp,
  UpdateRowFromDataAppPayload,
} from "metabase/dashboard/actions";
import {
  getDashCardById,
  getDashCardTable,
  getSingleDashCardData,
} from "metabase/dashboard/selectors";
import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";

import type { State } from "metabase-types/store";
import type { DashboardOrderedCard } from "metabase-types/api";
import type { Row } from "metabase-types/types/Dataset";
import type Table from "metabase-lib/metadata/Table";

interface OwnProps {
  isOpen: boolean;
  objectDetailDashCardId: number;
  onClose: () => void;
  children: React.ReactNode;
}

interface StateProps {
  dashCard?: DashboardOrderedCard;
  table?: Table | null;
  row?: Row;
}

interface DispatchProps {
  updateRow: (payload: UpdateRowFromDataAppPayload) => void;
}

type ImplicitUpdateModalProps = OwnProps & StateProps & DispatchProps;

function mapStateToProps(state: State, props: OwnProps) {
  const dashCard = getDashCardById(state, props.objectDetailDashCardId);
  const isObjectDetailView = dashCard?.card?.display === "object";

  if (!isObjectDetailView) {
    return {};
  }

  const table = getDashCardTable(state, props.objectDetailDashCardId);
  const dashCardData = getSingleDashCardData(
    state,
    props.objectDetailDashCardId,
  );
  const row = dashCardData?.rows[0];

  return { dashCard, table, row };
}

const mapDispatchToProps = {
  updateRow: updateRowFromDataApp,
};

function ImplicitUpdateModal({
  isOpen,
  dashCard,
  table,
  row,
  updateRow,
  onClose,
  children,
}: ImplicitUpdateModalProps) {
  function handleSubmit(values: Record<string, unknown>) {
    if (!table || !dashCard || !row) {
      return;
    }

    const primaryKeyFieldIndex = table.fields.findIndex(field => field.isPK());
    const primaryKeyValue = row[primaryKeyFieldIndex];
    return updateRow({
      id: primaryKeyValue,
      table,
      values,
    });
  }

  return (
    <>
      {children}
      {table && (
        <Modal isOpen={isOpen} onClose={onClose}>
          <WritebackModalForm
            table={table}
            row={row}
            type="update"
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
)(ImplicitUpdateModal);
