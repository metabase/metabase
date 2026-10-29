import { type ComponentType, type ReactNode, useEffect, useState } from "react";

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
import type {
  LoginStatus,
  MetabaseUser,
} from "embedding-sdk-bundle/types/user";
import { createMockSdkBundle } from "embedding-sdk-package/testing/lib/private/bundle";
import {
  acquireMockSdk,
  installMockSdk,
} from "embedding-sdk-package/testing/lib/private/install";
import type { MetabaseQueryMock } from "embedding-sdk-package/testing/lib/private/queries";

export type MetabaseTestOptions = {
  CollectionBrowser?: ComponentType<CollectionBrowserProps>;
  CreateDashboardModal?: ComponentType<CreateDashboardModalProps>;
  CreateQuestion?: ComponentType<CreateQuestionProps>;
  DateRangeCalendar?: ComponentType<DateRangeCalendarProps>;
  DateRangePopover?: ComponentType<DateRangePopoverProps>;
  EditableDashboard?: ComponentType<EditableDashboardProps>;
  InteractiveDashboard?: ComponentType<InteractiveDashboardProps>;
  InteractiveQuestion?: ComponentType<InteractiveQuestionProps>;
  MetabotQuestion?: ComponentType<MetabotQuestionProps>;
  StaticDashboard?: ComponentType<StaticDashboardProps>;
  StaticQuestion?: ComponentType<StaticQuestionProps>;
  user?: MetabaseUser | null;
  loginStatus?: LoginStatus;
  applicationName?: string;
  availableFonts?: string[];
  dataAppQueries?: readonly MetabaseQueryMock[];
};

export type MetabaseTestProviderProps = MetabaseTestOptions & {
  children?: ReactNode;
};

export function MetabaseTestProvider({
  children,
  ...options
}: MetabaseTestProviderProps) {
  const [bundle] = useState(() => installMockSdk(createMockSdkBundle(options)));

  useEffect(() => acquireMockSdk(bundle), [bundle]);

  return children;
}
