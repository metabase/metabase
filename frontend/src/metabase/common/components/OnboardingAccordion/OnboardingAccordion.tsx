import type { Ref } from "react";
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useMemo,
} from "react";

import { Accordion, Icon } from "metabase/ui";

import S from "./OnboardingAccordion.module.css";
import { useScrollItemIntoView } from "./hooks/use-scroll-item-into-view";
import type {
  AccordionContextValue,
  ItemContextValue,
  OnboardingAccordionControlProps,
  OnboardingAccordionItemProps,
  OnboardingAccordionPanelProps,
  OnboardingAccordionProps,
} from "./types";

const classNames = {
  chevron: S.chevron,
  content: S.content,
  control: S.control,
  icon: S.icon,
  item: S.item,
  label: S.label,
};

const AccordionContext = createContext<AccordionContextValue>({
  completedSteps: {},
  itemRefs: {},
});

const ItemContext = createContext<ItemContextValue>({
  value: "",
  icon: "empty",
});

export const OnboardingAccordion = ({
  children,
  completedSteps = {},
  onChange,
}: OnboardingAccordionProps) => {
  // Extract step IDs from children to create refs
  const stepIds = useMemo(() => {
    const ids: string[] = [];
    Children.forEach(children, (child) => {
      if (isValidElement(child) && child.props.value) {
        ids.push(child.props.value);
      }
    });
    return ids;
  }, [children]);

  const { itemRefs, handleChange } = useScrollItemIntoView(stepIds, onChange);

  // Calculate default open step: first incomplete step, or first step if all complete
  const calculatedDefaultValue = useMemo(() => {
    const firstIncomplete = stepIds.find((id) => !completedSteps[id]);

    return firstIncomplete ?? stepIds[0];
  }, [stepIds, completedSteps]);

  return (
    <AccordionContext.Provider value={{ completedSteps, itemRefs }}>
      <Accordion
        classNames={classNames}
        defaultValue={calculatedDefaultValue}
        onChange={handleChange}
      >
        {children}
      </Accordion>
    </AccordionContext.Provider>
  );
};

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

const OnboardingAccordionPanel = ({
  children,
}: OnboardingAccordionPanelProps) => {
  return <Accordion.Panel>{children}</Accordion.Panel>;
};

OnboardingAccordion.Item = OnboardingAccordionItem;
OnboardingAccordion.Control = OnboardingAccordionControl;
OnboardingAccordion.Panel = OnboardingAccordionPanel;
