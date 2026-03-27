import {
  getParameters,
  getTabHiddenParameterSlugs,
} from "metabase/dashboard/selectors";
import { connect } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

import { AddEditEmailSidebar as AddEditEmailSidebarComponent } from "./AddEditEmailSidebar";
import { AddEditSlackSidebar as AddEditSlackSidebarComponent } from "./AddEditSlackSidebar";

const mapStateToProps = (state: State) => {
  return {
    parameters: getParameters(state),
    hiddenParameters: getTabHiddenParameterSlugs(state),
  };
};

export const AddEditEmailSidebar = connect(mapStateToProps)(
  AddEditEmailSidebarComponent,
);
export const AddEditSlackSidebar = connect(mapStateToProps)(
  AddEditSlackSidebarComponent,
);
