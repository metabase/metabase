import { type ComponentType, type ReactNode, createElement } from "react";

import type { CollectionBrowserProps } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import type { CreateDashboardModalProps } from "embedding-sdk-bundle/components/public/CreateDashboardModal";
import type { CreateQuestionProps } from "embedding-sdk-bundle/components/public/CreateQuestion";
import type { DateRangeCalendarProps } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type { DateRangePopoverProps } from "embedding-sdk-bundle/components/public/DateRangePopover/DateRangePopover";
import type { InteractiveQuestionProps } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import type { MetabotQuestionProps } from "embedding-sdk-bundle/components/public/MetabotQuestion";
import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import type {
  EditableDashboardProps,
  InteractiveDashboardProps,
  StaticDashboardProps,
} from "embedding-sdk-bundle/components/public/dashboard";

import { getMockSdkRegistry } from "./mock-sdk-registry";

type ChildrenProps = { children?: ReactNode };

function renderNothing() {
  return null;
}

function renderChildren({ children }: ChildrenProps) {
  return children;
}

function createComponentMock<TProps extends object>(
  renderDefault: (props: TProps) => ReactNode,
) {
  let render: ComponentType<TProps> | undefined;

  getMockSdkRegistry().resets.add(() => {
    render = undefined;
  });

  function Component(props: TProps) {
    return <>{render ? createElement(render, props) : renderDefault(props)}</>;
  }

  function setMock(nextRender: ComponentType<TProps>) {
    render = nextRender;
  }

  return { Component, setMock };
}

export const COLLECTION_BROWSER_MOCK =
  createComponentMock<CollectionBrowserProps>(renderNothing);
export const CREATE_DASHBOARD_MODAL_MOCK =
  createComponentMock<CreateDashboardModalProps>(renderNothing);
export const CREATE_QUESTION_MOCK =
  createComponentMock<CreateQuestionProps>(renderNothing);
export const DATE_RANGE_CALENDAR_MOCK =
  createComponentMock<DateRangeCalendarProps>(renderNothing);
export const DATE_RANGE_POPOVER_MOCK =
  createComponentMock<DateRangePopoverProps>(renderChildren);
export const EDITABLE_DASHBOARD_MOCK =
  createComponentMock<EditableDashboardProps>(renderNothing);
export const INTERACTIVE_DASHBOARD_MOCK =
  createComponentMock<InteractiveDashboardProps>(renderNothing);
export const INTERACTIVE_QUESTION_MOCK =
  createComponentMock<InteractiveQuestionProps>(renderChildren);
export const METABOT_QUESTION_MOCK =
  createComponentMock<MetabotQuestionProps>(renderNothing);
export const STATIC_DASHBOARD_MOCK =
  createComponentMock<StaticDashboardProps>(renderNothing);
export const STATIC_QUESTION_MOCK =
  createComponentMock<StaticQuestionProps>(renderChildren);
