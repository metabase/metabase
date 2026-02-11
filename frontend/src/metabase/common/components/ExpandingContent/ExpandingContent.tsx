import cx from "classnames";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import CS from "metabase/css/core/index.css";
import { isReducedMotionPreferred } from "metabase/lib/dom";

interface ExpandingContentProps {
  isOpen?: boolean;
  isInitiallyOpen?: boolean;
  duration?: number;
  animateHeight?: boolean;
  animateOpacity?: boolean;
  children?: ReactNode;
}

export function ExpandingContent({
  isOpen: isOpenProp,
  isInitiallyOpen,
  duration = 300,
  animateHeight = true,
  animateOpacity = true,
  children,
}: ExpandingContentProps) {
  const [isOpen, setIsOpen] = useState(
    isInitiallyOpen == null ? true : !!isInitiallyOpen,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const open = !!isOpenProp;
    if (isOpen !== open) {
      clearTimer();
      setIsOpen(open);
      setIsTransitioning(true);
      timerRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenProp, duration, clearTimer]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const transition = isReducedMotionPreferred()
    ? "none"
    : `all ${duration}ms ease`;

  const maxHeight: number | string = isTransitioning
    ? (ref.current && ref.current.scrollHeight) || 0
    : "none";

  return (
    <div
      ref={ref}
      style={{
        transition,
        maxHeight: !animateHeight || isOpen ? maxHeight : 0,
        opacity: !animateOpacity || isOpen ? 1 : 0,
      }}
      className={cx({ [CS.overflowHidden]: !isOpen })}
    >
      {children}
    </div>
  );
}
