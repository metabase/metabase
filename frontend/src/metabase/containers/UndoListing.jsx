import PropTypes from "prop-types";
import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import BodyComponent from "metabase/components/BodyComponent";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { AUTO_WIRE_TOAST_TIMEOUT } from "metabase/dashboard/actions/auto-wire-parameters/constants";
import { capitalize, inflect } from "metabase/lib/formatting";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { dismissUndo, performUndo } from "metabase/redux/undo";
import { Progress, Transition } from "metabase/ui";

import {
  CardContent,
  CardContentSide,
  CardIcon,
  ControlsCardContent,
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

const slideIn = {
  in: { opacity: 1, transform: "translateY(0)" },
  out: { opacity: 0, transform: "translateY(100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

const scaleX = {
  in: { transform: "scaleX(0)" },
  out: { transform: "scaleX(1)" },
  common: { transformOrigin: "left" },
  transitionProperty: "transform",
};

const TOAST_TRANSITION_DURATION = 300;

function UndoToast({ undo, onUndo, onDismiss }) {
  const [mounted, setMounted] = useState(false);

  useMount(() => {
    setMounted(true);
  });

  return (
    <Transition
      mounted={mounted}
      transition={slideIn}
      duration={TOAST_TRANSITION_DURATION}
      timingFunction="ease"
    >
      {styles => (
        <ToastCard
          dark
          data-testid="toast-undo"
          color={undo.toastColor}
          role="status"
          noBorder={undo.showProgress}
          style={styles}
        >
          {undo.showProgress && <UndoProgress />}
          <CardContent>
            <CardContentSide maw="75ch">
              {undo.icon && <CardIcon name={undo.icon} color="text-white" />}
              <Ellipsified showTooltip={false}>
                {renderMessage(undo)}
              </Ellipsified>
            </CardContentSide>
            <ControlsCardContent>
              {undo.actions?.length > 0 && (
                <UndoButton role="button" onClick={onUndo}>
                  {undo.actionLabel ?? t`Undo`}
                </UndoButton>
              )}
              {undo.canDismiss && (
                <DismissIcon
                  color={undo.dismissIconColor || "inherit"}
                  name="close"
                  onClick={onDismiss}
                />
              )}
            </ControlsCardContent>
          </CardContent>
        </ToastCard>
      )}
    </Transition>
  );
}
function UndoListingInner() {
  const dispatch = useDispatch();
  const undos = useSelector(state => state.undo);

  return (
    <UndoList data-testid="undo-list" aria-label="undo-list">
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

function UndoProgress() {
  const [mounted, setMounted] = useState(false);

  useMount(() => {
    setMounted(true);
  });

  return (
    <Transition
      mounted={mounted}
      transition={scaleX}
      duration={AUTO_WIRE_TOAST_TIMEOUT - TOAST_TRANSITION_DURATION}
      timingFunction="linear"
    >
      {styles => (
        <Progress
          size="sm"
          value={100}
          style={{
            ...styles,
            width: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      )}
    </Transition>
  );
}

export const UndoListing = BodyComponent(UndoListingInner);
