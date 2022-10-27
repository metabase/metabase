import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";
import ConfirmContent from "metabase/components/ConfirmContent";

import {
  deleteRowFromDataApp,
  DeleteRowFromDataAppPayload,
} from "metabase/dashboard/actions";
import {
  getDashCardById,
  getDashCardTable,
  getSingleDashCardData,
} from "metabase/dashboard/selectors";

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
  deleteRow: (payload: DeleteRowFromDataAppPayload) => void;
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
  deleteRow: deleteRowFromDataApp,
};

function ImplicitDeleteModal({
  isOpen,
  dashCard,
  table,
  row,
  deleteRow,
  onClose,
  children,
}: ImplicitUpdateModalProps) {
  function handleDelete() {
    if (!table || !dashCard || !row) {
      return;
    }

    const primaryKeyFieldIndex = table.fields.findIndex(field => field.isPK());
    const primaryKeyValue = row[primaryKeyFieldIndex];

    deleteRow({
      id: primaryKeyValue,
      table,
    });
  }

  return (
    <>
      {children}
      {table && (
        <Modal isOpen={isOpen} onClose={onClose}>
          <ConfirmContent
            title={t`Delete ${table.objectName()}?`}
            message={t`This can't be undone.`}
            onAction={handleDelete}
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
)(ImplicitDeleteModal);
