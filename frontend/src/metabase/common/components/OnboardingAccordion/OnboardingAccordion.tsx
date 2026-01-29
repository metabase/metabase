import type { ReactNode, Ref } from "react";
import {
  Children,
  createContext,
  createRef,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
} from "react";

import type { IconName } from "metabase/ui";
import { Accordion, Icon } from "metabase/ui";

import S from "./OnboardingAccordion.module.css";

const classNames = {
  chevron: S.chevron,
  content: S.content,
  control: S.control,
  icon: S.icon,
  item: S.item,
  label: S.label,
};

interface AccordionContextValue {
  completedSteps: Record<string, boolean>;
  itemRefs: Record<string, React.RefObject<HTMLDivElement>>;
}

const AccordionContext = createContext<AccordionContextValue>({
  completedSteps: {},
  itemRefs: {},
});

interface ItemContextValue {
  value: string;
  icon: IconName;
}

const ItemContext = createContext<ItemContextValue>({
  value: "",
  icon: "empty",
});

export interface OnboardingAccordionProps {
  children: ReactNode;
  /** Record of step values to their completion status */
  completedSteps?: Record<string, boolean>;
  /** Controlled value - which step is currently open */
  value?: string | null;
  /** Callback when the open step changes */
  onChange?: (value: string | null) => void;
  /** Override the default open step (defaults to first incomplete step) */
  defaultValue?: string;
}

export const OnboardingAccordion = ({
  children,
  completedSteps = {},
  value,
  onChange,
  defaultValue,
}: OnboardingAccordionProps) => {
  // Extract step values from children to create refs
  const stepValues = useMemo(() => {
    const values: string[] = [];
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.value) {
        values.push(child.props.value);
      }
    });
    return values;
  }, [children]);

  // Create refs for each step for scroll-into-view
  const itemRefs = useMemo(() => {
    return stepValues.reduce(
      (refs, stepValue) => {
        refs[stepValue] = createRef<HTMLDivElement>();
        return refs;
      },
      {} as Record<string, React.RefObject<HTMLDivElement>>,
    );
  }, [stepValues]);

  // Calculate default open step: first incomplete step, or first step if all complete
  const calculatedDefaultValue = useMemo(() => {
    if (defaultValue) {
      return defaultValue;
    }
    const firstIncomplete = stepValues.find((v) => !completedSteps[v]);
    return firstIncomplete ?? stepValues[0];
  }, [stepValues, completedSteps, defaultValue]);

  const scrollIntoView = useCallback(
    (stepValue: string | null) => {
      if (stepValue && itemRefs[stepValue]) {
        itemRefs[stepValue].current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [itemRefs],
  );

  const handleChange = useCallback(
    (newValue: string | null) => {
      scrollIntoView(newValue);
      onChange?.(newValue);
    },
    [scrollIntoView, onChange],
  );

  return (
    <AccordionContext.Provider value={{ completedSteps, itemRefs }}>
      <Accordion
        classNames={classNames}
        defaultValue={calculatedDefaultValue}
        value={value}
        onChange={handleChange}
      >
        {children}
      </Accordion>
    </AccordionContext.Provider>
  );
};

export interface OnboardingAccordionItemProps {
  value: string;
  icon: IconName;
  children: ReactNode;
  "data-testid"?: string;
}

const OnboardingAccordionItem = forwardRef(function OnboardingAccordionItem(
  {
    value,
    icon,
    children,
    "data-testid": testId,
  }: OnboardingAccordionItemProps,
  forwardedRef: Ref<HTMLDivElement>,
) {
  const { itemRefs } = useContext(AccordionContext);
  const ref = forwardedRef ?? itemRefs[value];

  return (
    <ItemContext.Provider value={{ value, icon }}>
      <Accordion.Item value={value} data-testid={testId} ref={ref}>
        {children}
      </Accordion.Item>
    </ItemContext.Provider>
  );
});

export interface OnboardingAccordionControlProps {
  children: ReactNode;
}

const OnboardingAccordionControl = ({
  children,
}: OnboardingAccordionControlProps) => {
  const { completedSteps } = useContext(AccordionContext);
  const { value, icon } = useContext(ItemContext);
  const isCompleted = completedSteps[value] ?? false;

  const renderIcon = () => {
    if (isCompleted) {
      return <Icon name="check" c="success" />;
    }
    return <Icon name={icon} />;
  };

  return (
    <Accordion.Control
      icon={renderIcon()}
      className={isCompleted ? S.completedControl : undefined}
    >
      {children}
    </Accordion.Control>
  );
};

export interface OnboardingAccordionPanelProps {
  children: ReactNode;
}

const OnboardingAccordionPanel = ({
  children,
}: OnboardingAccordionPanelProps) => {
  return <Accordion.Panel>{children}</Accordion.Panel>;
};

OnboardingAccordion.Item = OnboardingAccordionItem;
OnboardingAccordion.Control = OnboardingAccordionControl;
OnboardingAccordion.Panel = OnboardingAccordionPanel;
