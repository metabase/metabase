import { useMounted } from "@mantine/hooks";
import { useLayoutEffect } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import ZIndex from "metabase/css/core/z-index.module.css";
import { capitalize, inflect } from "metabase/lib/formatting";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  dismissUndo,
  pauseUndo,
  performUndo,
  resumeUndo,
} from "metabase/redux/undo";
import { Portal, Progress, Transition } from "metabase/ui";
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
  in: { opacity: 1, transform: "translateX(0)" },
  out: { opacity: 0, transform: "translateX(-50px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

const TOAST_TRANSITION_DURATION = 300;

function UndoToast({
  undo,
  onUndo,
  onDismiss,
}: {
  undo: Undo;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const dispatch = useDispatch();
  const mounted = useMounted();

  const handleMouseEnter = () => {
    if (undo.showProgress) {
      dispatch(pauseUndo(undo));
    }
  };

  const handleMouseLeave = () => {
    if (undo.showProgress) {
      dispatch(resumeUndo(undo));
    }
  };

  return (
    <Transition
      mounted={mounted}
      transition={slideIn}
      duration={TOAST_TRANSITION_DURATION}
      timingFunction="ease"
    >
      {(styles) => (
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
              color={undo.pausedAt ? "bg-dark" : "brand"}
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

export function UndoListing() {
  const dispatch = useDispatch();
  const undos = useSelector((state) => state.undo);

  return (
    <UndoListOverlay
      undos={undos}
      onUndo={(undo) => dispatch(performUndo(undo.id))}
      onDismiss={(undo) => dispatch(dismissUndo({ undoId: undo.id }))}
    />
  );
}

const target = document.createElement("div");

export function UndoListOverlay({
  undos,
  onUndo,
  onDismiss,
}: {
  undos: Undo[];
  onUndo: (undo: Undo) => void;
  onDismiss: (undo: Undo) => void;
}) {
  // Reverse the list so new todos are rendered on top
  const reversed = Array.from(undos).reverse();

  // lastId changes when a new undo is added
  const lastId = undos.at(-1)?._domId;

  useLayoutEffect(() => {
    // When a new undo is added, we move the target to the
    // end of the body so that it is always on top
    document.body.appendChild(target);
  }, [lastId]);

  return (
    <Portal target={target}>
      <UndoList
        data-testid="undo-list"
        aria-label="undo-list"
        className={ZIndex.Overlay}
      >
        {reversed.map((undo) => (
          <UndoToast
            key={undo._domId}
            undo={undo}
            onUndo={() => onUndo(undo)}
            onDismiss={() => onDismiss(undo)}
          />
        ))}
      </UndoList>
    </Portal>
  );
}
