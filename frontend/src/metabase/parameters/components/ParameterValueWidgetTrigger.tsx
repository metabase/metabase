import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  forwardRef,
} from "react";

import { Box, Flex, UnstyledButton } from "metabase/ui";

import S from "./ParameterValueWidget.module.css";

export const ParameterValueWidgetTrigger = forwardRef(
  ParameterValueWidgetTriggerInner,
);

type ParameterValueWidgetTriggerProps = {
  children: ReactNode;
  hasValue: boolean;
  ariaLabel?: string;
  className?: string;
  mimicMantine?: boolean;
  hasPopover?: boolean;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

function ParameterValueWidgetTriggerInner(
  {
    children,
    hasValue,
    ariaLabel,
    className,
    mimicMantine = false,
    hasPopover = false,
    ...htmlProps
  }: ParameterValueWidgetTriggerProps,
  ref: Ref<HTMLElement>,
) {
  const elementRef = useMergedRef(ref);

  if (mimicMantine) {
    const flexProps = {
      align: "center" as const,
      pos: "relative" as const,
      w: "100%",
      className: cx(S.TriggerContainer, {
        [S.hasValue]: hasValue,
      }),
      "aria-label": ariaLabel,
      ...htmlProps,
    };

    return hasPopover ? (
      <Flex
        {...flexProps}
        renderRoot={(props) => (
          <UnstyledButton {...props} ref={elementRef} type="button" />
        )}
      >
        {children}
      </Flex>
    ) : (
      <Flex {...flexProps} component="div" ref={elementRef}>
        {children}
      </Flex>
    );
  }

  const boxProps = {
    className: cx(S.parameter, className, {
      [S.selected]: hasValue,
    }),
    "aria-label": ariaLabel,
    maw: "100%",
    ...htmlProps,
  };

  return hasPopover ? (
    <Box
      {...boxProps}
      renderRoot={(props) => (
        <UnstyledButton {...props} ref={elementRef} type="button" />
      )}
    >
      {children}
    </Box>
  ) : (
    <Box {...boxProps} component="div" ref={elementRef}>
      {children}
    </Box>
  );
}
