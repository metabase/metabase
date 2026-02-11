import {
  getParameters,
  getTabHiddenParameterSlugs,
} from "metabase/dashboard/selectors";
import { connect } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import { AddEditEmailSidebar as AddEditEmailSidebarComponent } from "./AddEditEmailSidebar";
import { AddEditSlackSidebar as AddEditSlackSidebarComponent } from "./AddEditSlackSidebar";

const mapStateToProps = (state: State, props: Record<string, unknown>) => {
  return {
    parameters: getParameters(state, props),
    hiddenParameters: getTabHiddenParameterSlugs(state, props),
  };
};

export const AddEditEmailSidebar = connect(mapStateToProps)(
  AddEditEmailSidebarComponent,
);
export const AddEditSlackSidebar = connect(mapStateToProps)(
  AddEditSlackSidebarComponent,
);
