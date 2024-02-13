import {
  useFloating,
  shift,
  flip,
  arrow,
  offset,
  size,
  inline,
  limitShift,
} from "@floating-ui/react";
import type { Middleware, Placement } from "@floating-ui/react";
import type { PopoverProps } from "@mantine/core";
import { useDidUpdate, useUncontrolled } from "@mantine/hooks";
import { useFloatingAutoUpdate } from "./use-floating-auto-update";

interface UsePopoverOptions {
  offset: number;
  position: Placement;
  positionDependencies: any[];
  onPositionChange?(position: Placement): void;
  opened: boolean;
  defaultOpened: boolean;
  onChange(opened: boolean): void;
  onClose?(): void;
  onOpen?(): void;
  width: PopoverProps["width"];
  middlewares: PopoverProps["middlewares"];
  arrowRef: React.RefObject<HTMLDivElement>;
  arrowOffset: number;
}

function getPopoverMiddlewares(options: UsePopoverOptions) {
  const middlewares: Middleware[] = [offset(options.offset)];

  if (options.middlewares?.shift) {
    middlewares.push(shift({ limiter: limitShift() }));
  }

  if (options.middlewares?.flip) {
    middlewares.push(flip());
  }

  if (options.middlewares?.inline) {
    middlewares.push(inline());
  }

  middlewares.push(
    arrow({ element: options.arrowRef, padding: options.arrowOffset }),
  );

  return middlewares;
}

export function usePopover(options: UsePopoverOptions) {
  const [_opened, setOpened] = useUncontrolled({
    value: options.opened,
    defaultValue: options.defaultOpened,
    finalValue: false,
    onChange: options.onChange,
  });

  const onClose = () => {
    options.onClose?.();
    setOpened(false);
  };

  const onToggle = () => {
    if (_opened) {
      options.onClose?.();
      setOpened(false);
    } else {
      options.onOpen?.();
      setOpened(true);
    }
  };

  const floating = useFloating({
    placement: options.position,
    middleware: [
      ...getPopoverMiddlewares(options),
      size({
        apply({ rects, availableHeight, availableWidth }) {
          Object.assign(floating.refs.floating.current?.style ?? {}, {
            width: options.width === "auto" ? `${rects.reference.width}px` : "",
            maxHeight: `${availableHeight}px`,
            maxWidth: `${availableWidth}px`,
          });
        },
      }),
    ],
  });

  useFloatingAutoUpdate({
    opened: options.opened,
    position: options.position,
    positionDependencies: options.positionDependencies,
    floating,
  });

  useDidUpdate(() => {
    options.onPositionChange?.(floating.placement);
  }, [floating.placement]);

  useDidUpdate(() => {
    if (!options.opened) {
      options.onClose?.();
    } else {
      options.onOpen?.();
    }
  }, [options.opened]);

  return {
    floating,
    controlled: options.opened !== null,
    opened: _opened,
    onClose,
    onToggle,
  };
}
