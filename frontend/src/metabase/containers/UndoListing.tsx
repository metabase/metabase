import { useState } from "react";
import { useMount } from "react-use";
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
import type { Undo } from "metabase-types/store/undo";

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

function DefaultMessage({
  undo: { verb = t`modified`, count = 1, subject = t`item` },
}: {
  undo: Undo;
}) {
  return (
    <DefaultText>
      {count > 1
        ? `${capitalize(verb)} ${count} ${inflect(subject, count)}`
        : `${capitalize(verb)} ${subject}`}
    </DefaultText>
  );
}

function renderMessage(undo: Undo) {
  const { message } = undo;
  if (!message) {
    return <DefaultMessage undo={undo || {}} />;
  }
  return typeof message === "function" ? message(undo) : message;
}

const slideIn = {
  in: { opacity: 1, transform: "translateY(0)" },
  out: { opacity: 0, transform: "translateY(100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

const TOAST_TRANSITION_DURATION = 300;

interface UndoToastProps {
  undo: Undo;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ undo, onUndo, onDismiss }: UndoToastProps) {
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
          className={CS.toast}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {undo.showProgress && (
            <Progress
              size="sm"
              color={paused ? "bg-dark" : "brand"}
              /* we intentionally break a11y - css animation is smoother */
              value={100}
              pos="absolute"
              top={0}
              left={0}
              w="100%"
              className={CS.progress}
              /* override animation duration based on timeout */
              style={{
                animationDuration: `${undo.initialTimeout}ms`,
              }}
            />
          )}
          <CardContent>
            <CardContentSide maw="75ch">
              {undo.icon && <CardIcon name={undo.icon} color="text-white" />}
              <Ellipsified showTooltip={false}>
                {renderMessage(undo)}
              </Ellipsified>
            </CardContentSide>
            <ControlsCardContent>
              {undo.actions && undo.actions.length > 0 && (
                <UndoButton role="button" onClick={onUndo} to="">
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
          onDismiss={() => dispatch(dismissUndo({ undoId: undo.id }))}
        />
      ))}
    </UndoList>
  );
}

export const UndoListing = BodyComponent(UndoListingInner);
