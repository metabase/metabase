import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useEffect,
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

import { Ellipsified } from "metabase/common/components/Ellipsified";
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
          color={undo.pausedAt ? "background-tertiary-inverse" : "brand"}
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
              c={undo.iconColor ?? "text-secondary-inverse"}
            />
          )}
          {undo.renderChildren ? (
            undo.renderChildren(undo)
          ) : (
            <Ellipsified showTooltip={false}>{renderMessage(undo)}</Ellipsified>
          )}
        </CardContentSide>
        <ControlsCardContent>
          {undo.actions && undo.actions.length > 0 && (
            <UndoButton role="button" onClick={onUndo} to="">
              {undo.actionLabel ?? t`Undo`}
            </UndoButton>
          )}
          {undo.extraAction && (
            <UndoButton
              role="button"
              onClick={() => {
                undo.extraAction?.action();
                if (undo.canDismiss) {
                  onDismiss();
                }
              }}
              to=""
            >
              {undo.extraAction.label}
            </UndoButton>
          )}
          {undo.canDismiss && (
            <DismissIcon
              color={undo.dismissIconColor || "text-secondary-inverse"}
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
      onDismiss={(undo) => {
        undo.onDismiss?.(undo.id);
        dispatch(dismissUndo({ undoId: undo.id }));
      }}
    />
  );
}

const target = document.createElement("div");
document.body.appendChild(target);

// The react transition group state transitions are flaky in cypress
// so disable them for altogether.
const Group = "Cypress" in window ? MockGroup : TransitionGroup;

function MockGroup({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

const Item =
  "Cypress" in window
    ? function MockItem({
        children,
      }: {
        children: (state: TransitionStatus) => ReactNode;
      }) {
        return children("entered");
      }
    : Transition;

export function UndoListOverlay({
  undos,
  onUndo,
  onDismiss,
}: {
  undos: Undo[];
  onUndo: (undo: Undo) => void;
  onDismiss: (undo: Undo) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const prevUndos = useRef<Undo[]>([]);

  const [heights, setHeights] = useState<number[]>([]);
  const [transitionState, setTransitionState] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    // When a new undo is added, we move the Portals' target to the
    // end of the body so that its renders on top of the z-index stack, and
    // thus on top of any other overlays.
    //
    // To be reliable this needs to happen after other renders have settled,
    // so we do this in a timeout. Otherwise there might be other Portals
    // that end up rendering at the same time and this makes the order unpredictable.
    //
    // To avoid resetting the transition state of the toasts, we track the
    // when the target was appended to the body and only enable the transition
    // once the target has been appended (via the custom in: prop on the Undo).
    const timeout = setTimeout(() => {
      const prev = prevUndos.current ?? [];
      prevUndos.current = undos;

      if (prev.length < undos.length) {
        // Avoid moving the portal if we're not adding new undos.
        // Undos transitioning out do not need to be rendered on top.
        document.body.appendChild(target);
      }

      // Allow new items to transition
      setTransitionState(function (prevState) {
        const newState = Object.fromEntries(
          undos.map((undo) => [undo.id, true]),
        );
        return { ...prevState, ...newState };
      });
    }, 1);
    return () => clearTimeout(timeout);
  }, [undos]);

  useLayoutEffect(() => {
    // We measure the height of all toasts so we know where to render
    // the next one.
    setHeights(
      undos
        .map((undo) => undo.ref?.current?.getBoundingClientRect().height ?? 0)
        .filter((height) => height > 0),
    );
  }, [undos]);

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
          {undos.map(
            (undo, index) =>
              transitionState[undo.id] && (
                <Item
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
                </Item>
              ),
          )}
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
      transform: `translate(-30px, ${-bottom}px)`,
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
      transform: `translate(-30px, ${-bottom}px)`,
      transition,
      zIndex: 1,
    };
  }

  throw new Error(`Unexpected state: ${state}`);
}
