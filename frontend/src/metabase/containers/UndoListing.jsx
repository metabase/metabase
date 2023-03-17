import React from "react";
import PropTypes from "prop-types";
import { useSelector, useDispatch } from "react-redux";
import { Motion, spring } from "react-motion";
import { t } from "ttag";

import { capitalize, inflect } from "metabase/lib/formatting";
import { dismissUndo, performUndo } from "metabase/redux/undo";

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
    <Motion
      defaultStyle={{ opacity: 0, translateY: 100 }}
      style={{ opacity: spring(1), translateY: spring(0) }}
    >
      {({ translateY }) => (
        <ToastCard
          dark
          data-testid="toast-undo"
          translateY={translateY}
          color={undo.toastColor}
        >
          <CardContent>
            <CardContentSide>
              <CardIcon name={undo.icon || "check"} color="white" />
              {renderMessage(undo)}
            </CardContentSide>
            <CardContentSide>
              {undo.actions?.length > 0 && (
                <UndoButton
                  role="button"
                  onClick={onUndo}
                >{t`Undo`}</UndoButton>
              )}
              <DismissIcon name="close" onClick={onDismiss} />
            </CardContentSide>
          </CardContent>
        </ToastCard>
      )}
    </Motion>
  );
}

function UndoListingInner() {
  const dispatch = useDispatch();
  const undos = useSelector(state => state.undo);

  return (
    <UndoList>
      {undos.map(undo => (
        <UndoToast
          key={undo._domId}
          undo={undo}
          onUndo={() => dispatch(performUndo(undo.id))}
          onDismiss={() => dispatch(dismissUndo(undo.id))}
        />
      ))}
    </UndoList>
  );
}

export const UndoListing = BodyComponent(UndoListingInner);
