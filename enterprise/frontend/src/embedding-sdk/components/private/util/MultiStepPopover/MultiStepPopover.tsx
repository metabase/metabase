import {
  Children,
  type PropsWithChildren,
  type ReactElement,
  isValidElement,
} from "react";

import { Popover, type PopoverProps } from "metabase/ui";

type StepValue = string | number;

type StepProps = PropsWithChildren<{
  value: StepValue;
}>;

const Step = ({ children }: PropsWithChildren<StepProps>) => {
  return children;
};

const Target = ({ children }: PropsWithChildren) => {
  return <>{children}</>;
};

export type MultiStepState<T extends StepValue = StepValue> = T | null;

type MultiStepPopoverProps<T extends StepValue = StepValue> =
  PropsWithChildren<{
    currentStep: MultiStepState<T>;
    onClose?: () => void;
  }>;

const MultiStepPopoverContent = ({
  currentStep,
  onClose,
  children,
  ...popoverProps
}: MultiStepPopoverProps &
  Omit<PopoverProps, "children" | "onClose" | "opened">) => {
  const findChild = <T extends ReactElement>(
    predicate: (child: ReactElement) => child is T,
  ): T | null => {
    const child = Children.toArray(children).find(
      (child): child is T => isValidElement(child) && predicate(child),
    );
    return child || null;
  };

  const currentStepContent = findChild(
    (child): child is ReactElement<StepProps> =>
      child.type === Step && child.props.value === currentStep,
  )?.props.children;

  const targetElement = findChild(
    (child): child is ReactElement => child.type === Target,
  )?.props.children;

  return (
    <Popover
      position="bottom-start"
      opened={currentStep !== null}
      onClose={onClose}
      {...popoverProps}
    >
      <Popover.Target>{targetElement}</Popover.Target>
      <Popover.Dropdown>{currentStepContent}</Popover.Dropdown>
    </Popover>
  );
};

export const MultiStepPopover = Object.assign(MultiStepPopoverContent, {
  Step,
  Target,
});
