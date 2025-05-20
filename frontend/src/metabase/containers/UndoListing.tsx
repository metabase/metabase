import {
  type CSSProperties,
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Transition,
  TransitionGroup,
  type TransitionStatus,
} from "react-transition-group";
import { t } from "ttag";
import _ from "underscore";

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
import { Portal, Progress } from "metabase/ui";
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

const TOAST_TRANSITION_DURATION = 300;
const MARGIN = 8;

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

function UndoToast({
  undo,
  onUndo,
  onDismiss,
  style,
}: {
  undo: Undo;
  onUndo: () => void;
  onDismiss: () => void;
  style: CSSProperties;
}) {
  const dispatch = useDispatch();

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
    <ToastCard
      ref={undo.ref}
      dark
      data-testid="toast-undo"
      color={undo.toastColor}
      role="status"
      noBorder={undo.showProgress}
      className={CS.toast}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={style}
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
          {undo.icon && (
            <CardIcon
              name={undo.icon}
              color="var(--mb-color-text-secondary-inverse)"
            />
          )}
          <Ellipsified showTooltip={false}>{renderMessage(undo)}</Ellipsified>
        </CardContentSide>
        <ControlsCardContent>
          {undo.actions && undo.actions.length > 0 && (
            <UndoButton role="button" onClick={onUndo} to="">
              {undo.actionLabel ?? t`Undo`}
            </UndoButton>
          )}
          {undo.canDismiss && (
            <DismissIcon
              color={
                undo.dismissIconColor ||
                "var(--mb-color-text-secondary-inverse)"
              }
              name="close"
              onClick={onDismiss}
            />
          )}
        </ControlsCardContent>
      </CardContent>
    </ToastCard>
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

// The react transition group state transitions are flaky in cypress
// so disable them for altogether.
const Group = "Cypress" in window ? Fragment : TransitionGroup;

export function UndoListOverlay({
  undos,
  onUndo,
  onDismiss,
}: {
  undos: Undo[];
  onUndo: (undo: Undo) => void;
  onDismiss: (undo: Undo) => void;
}) {
  // lastId changes when a new undo is added
  const lastId = undos.at(-1)?._domId;

  const ref = useRef<HTMLUListElement>(null);
  const [heights, setHeights] = useState<number[]>([]);

  useLayoutEffect(() => {
    // When a new undo is added, we move the target to the
    // end of the body so that it is always on top
    document.body.appendChild(target);
  }, [lastId]);

  useLayoutEffect(() => {
    // measure the heights of each toast
    const els = Array.from(
      ref.current?.querySelectorAll("[data-testid='toast-undo']") ?? [],
    );
    const newHeights = els
      .map((el) => {
        return el.getBoundingClientRect().height;
      })
      .filter((height) => height > 0);

    if (!_.isEqual(heights, newHeights)) {
      setHeights(newHeights);
    }
  }, [undos, heights]);

  function heightAtIndex(index: number) {
    return heights.reduce((acc, height, idx) => {
      if (idx < index) {
        return acc + height + MARGIN;
      }
      return acc;
    }, 0);
  }

  return (
    <Portal target={target}>
      <UndoList
        ref={ref}
        data-testid="undo-list"
        aria-label="undo-list"
        className={ZIndex.Overlay}
      >
        <Group appear enter exit component={null}>
          {undos.map((undo, index) => (
            <Transition
              key={undo._domId}
              in
              timeout={{
                enter: 0,
                exit: TOAST_TRANSITION_DURATION,
              }}
              nodeRef={undo.ref}
              mountOnEnter
              unmountOnExit
            >
              {(state) => (
                <UndoToast
                  undo={undo}
                  onUndo={() => onUndo(undo)}
                  onDismiss={() => onDismiss(undo)}
                  style={transition(state, heightAtIndex(index))}
                />
              )}
            </Transition>
          ))}
        </Group>
      </UndoList>
    </Portal>
  );
}

function transition(state: TransitionStatus, bottom: number) {
  const transition = `
    opacity ${TOAST_TRANSITION_DURATION}ms ease,
    transform ${TOAST_TRANSITION_DURATION}ms ease,
    bottom ${TOAST_TRANSITION_DURATION}ms ease
  `;

  if (state === "entering") {
    return {
      opacity: 0,
      transform: `translate(-20px, ${-bottom}px)`,
      zIndex: 1,
    };
  }

  if (state === "entered") {
    return {
      opacity: 1,
      transform: `translate(0, ${-bottom}px)`,
      transition,
      zIndex: 1,
    };
  }

  if (state === "exiting") {
    return {
      opacity: 0,
      transform: `translate(0, ${-bottom + 25}px) scale(0.9)`,
      transition,
      zIndex: 0,
    };
  }

  if (state === "exited") {
    return {
      opacity: 0,
      transform: `translate(0, ${-bottom}px)`,
      transition,
      zIndex: 1,
    };
  }

  throw new Error(`Unexpected state: ${state}`);
}
