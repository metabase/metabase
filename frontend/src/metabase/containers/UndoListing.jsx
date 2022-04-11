import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { capitalize, inflect } from "metabase/lib/formatting";
import { dismissUndo, performUndo } from "metabase/redux/undo";
import { getUndos } from "metabase/selectors/undo";

import BodyComponent from "metabase/components/BodyComponent";

import {
  CardContent,
  CardContentSide,
  CardIcon,
  DefaultText,
  DismissIcon,
  ToastCard,
  UndoButton,
  UndoList,
} from "./UndoListing.styled";

const mapStateToProps = (state, props) => ({
  undos: getUndos(state, props),
});

const mapDispatchToProps = {
  dismissUndo,
  performUndo,
};

DefaultMessage.propTypes = {
  undo: PropTypes.object.isRequired,
};

function DefaultMessage({
  undo: { verb = t`modified`, count = 1, subject = t`item` },
}) {
  return (
    <DefaultText>
      {count > 1
        ? `${capitalize(verb)} ${count} ${inflect(subject, count)}`
        : `${capitalize(verb)} ${subject}`}
    </DefaultText>
  );
}

function renderMessage(undo) {
  const { message } = undo;
  if (!message) {
    return <DefaultMessage undo={undo || {}} />;
  }
  return typeof message === "function" ? message(undo) : message;
}

UndoToast.propTypes = {
  undo: PropTypes.object.isRequired,
  onUndo: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

function UndoToast({ undo, onUndo, onDismiss }) {
  return (
    <ToastCard dark data-testid="toast-undo">
      <CardContent>
        <CardContentSide>
          <CardIcon name={undo.icon || "check"} color="white" />
          {renderMessage(undo)}
        </CardContentSide>
        <CardContentSide>
          {undo.actions?.length > 0 && (
            <UndoButton onClick={onUndo}>{t`Undo`}</UndoButton>
          )}
          <DismissIcon name="close" onClick={onDismiss} />
        </CardContentSide>
      </CardContent>
    </ToastCard>
  );
}

UndoListing.propTypes = {
  undos: PropTypes.array.isRequired,
  performUndo: PropTypes.func.isRequired,
  dismissUndo: PropTypes.func.isRequired,
};

function UndoListing({ undos, performUndo, dismissUndo }) {
  return (
    <UndoList>
      {undos.map(undo => (
        <UndoToast
          key={undo._domId}
          undo={undo}
          onUndo={() => performUndo(undo.id)}
          onDismiss={() => dismissUndo(undo.id)}
        />
      ))}
    </UndoList>
  );
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  BodyComponent,
)(UndoListing);
