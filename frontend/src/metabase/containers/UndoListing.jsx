import PropTypes from "prop-types";
import { useState } from "react";
import { useInterval, useMount } from "react-use";
import { t } from "ttag";

import BodyComponent from "metabase/components/BodyComponent";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { capitalize, inflect } from "metabase/lib/formatting";
import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  dismissUndo,
  pauseUndo,
  performUndo,
  resumeUndo,
} from "metabase/redux/undo";
import { Progress, Transition } from "metabase/ui";

import CS from "./UndoListing.module.css";
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

const TOAST_TRANSITION_DURATION = 300;

function UndoToast({ undo, onUndo, onDismiss }) {
  const dispatch = useDispatch();
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);

  useMount(() => {
    setMounted(true);
  });

  const handleMouseEnter = () => {
    if (!undo.showProgress) {
      return;
    }
    setPaused(true);
    dispatch(pauseUndo(undo));
  };

  const handleMouseLeave = () => {
    if (!undo.showProgress) {
      return;
    }

    setPaused(false);
    dispatch(resumeUndo(undo));
  };

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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {undo.showProgress && (
            <UndoProgress paused={paused} timeout={undo.timeout} />
          )}
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

function UndoProgress({ paused, timeout: initialTimeout }) {
  const [value, setValue] = useState(100);
  // timeout of undo will change after pause/resume, but it shouldn't affect
  // progress bar step
  const [timeout] = useState(initialTimeout);
  const [isRunning, setIsRunning] = useState(true);
  const transitionTime = 100; // default value in Progress in v7
  const step = 100 / (timeout / transitionTime);

  useInterval(
    () => {
      setValue(value => {
        const newValue = value - step;

        if (newValue <= 0) {
          setIsRunning(false);
        }

        return newValue;
      });
    },
    isRunning && !paused ? transitionTime : null,
  );

  return (
    <Progress
      size="sm"
      color={paused ? "bg-dark" : "brand"}
      value={value}
      className={CS.progress}
    />
  );
}

UndoProgress.propTypes = {
  paused: PropTypes.bool.isRequired,
  timeout: PropTypes.number.isRequired,
};

export const UndoListing = BodyComponent(UndoListingInner);
