import {
  Children,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from "react";

import { Paper, Popover } from "metabase/ui";

const Step = ({ children }: StepProps) => {
  return <Paper className="p-4">{children}</Paper>;
};

type StepProps = {
  value: string | number;
  children: ReactNode;
};

const isStepElement = (
  element: ReactElement,
): element is ReactElement<StepProps> => {
  return element.type === Step;
};

type MultiStepPopoverTargetProps = {
  children: ReactNode;
};

const Target = ({ children }: MultiStepPopoverTargetProps) => {
  return <>{children}</>;
};

const MultiStepPopover = ({
  currentStep,
  children,
}: PropsWithChildren<{
  currentStep: string | number;
}>) => {
  const getCurrentStepContent = () => {
    return (
      Children.toArray(children)
        .filter((child): child is ReactElement => isValidElement(child))
        .find(
          child => isStepElement(child) && child.props.value === currentStep,
        )?.props.children || null
    );
  };

  return (
    <Popover>
      <Popover.Target>
        {Children.toArray(children)
          .filter((child): child is ReactElement => isValidElement(child))
          .find(child => child.type === Target)?.props.children || null}
      </Popover.Target>
      <Popover.Dropdown>{getCurrentStepContent()}</Popover.Dropdown>
    </Popover>
  );
};

MultiStepPopover.Target = Target;
MultiStepPopover.Step = Step;

export { MultiStepPopover };
