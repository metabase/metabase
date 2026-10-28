import type { ComponentType } from "react";

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

import {
  COLLECTION_BROWSER_MOCK,
  CREATE_DASHBOARD_MODAL_MOCK,
  CREATE_QUESTION_MOCK,
  DATE_RANGE_CALENDAR_MOCK,
  DATE_RANGE_POPOVER_MOCK,
  EDITABLE_DASHBOARD_MOCK,
  INTERACTIVE_DASHBOARD_MOCK,
  INTERACTIVE_QUESTION_MOCK,
  METABOT_QUESTION_MOCK,
  STATIC_DASHBOARD_MOCK,
  STATIC_QUESTION_MOCK,
} from "./lib/component-mocks";

export function mockCollectionBrowser(
  render: ComponentType<CollectionBrowserProps>,
) {
  COLLECTION_BROWSER_MOCK.setMock(render);
}

export function mockCreateDashboardModal(
  render: ComponentType<CreateDashboardModalProps>,
) {
  CREATE_DASHBOARD_MODAL_MOCK.setMock(render);
}

export function mockCreateQuestion(render: ComponentType<CreateQuestionProps>) {
  CREATE_QUESTION_MOCK.setMock(render);
}

export function mockDateRangeCalendar(
  render: ComponentType<DateRangeCalendarProps>,
) {
  DATE_RANGE_CALENDAR_MOCK.setMock(render);
}

export function mockDateRangePopover(
  render: ComponentType<DateRangePopoverProps>,
) {
  DATE_RANGE_POPOVER_MOCK.setMock(render);
}

export function mockEditableDashboard(
  render: ComponentType<EditableDashboardProps>,
) {
  EDITABLE_DASHBOARD_MOCK.setMock(render);
}

export function mockInteractiveDashboard(
  render: ComponentType<InteractiveDashboardProps>,
) {
  INTERACTIVE_DASHBOARD_MOCK.setMock(render);
}

export function mockInteractiveQuestion(
  render: ComponentType<InteractiveQuestionProps>,
) {
  INTERACTIVE_QUESTION_MOCK.setMock(render);
}

export function mockMetabotQuestion(
  render: ComponentType<MetabotQuestionProps>,
) {
  METABOT_QUESTION_MOCK.setMock(render);
}

export function mockStaticDashboard(
  render: ComponentType<StaticDashboardProps>,
) {
  STATIC_DASHBOARD_MOCK.setMock(render);
}

export function mockStaticQuestion(render: ComponentType<StaticQuestionProps>) {
  STATIC_QUESTION_MOCK.setMock(render);
}
