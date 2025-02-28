import {
  getParameters,
  getTabHiddenParameterSlugs,
} from "metabase/dashboard/selectors";
import { connect } from "metabase/lib/redux";

import { AddEditEmailSidebar as AddEditEmailSidebarComponent } from "./AddEditEmailSidebar";
import { AddEditSlackSidebar as AddEditSlackSidebarComponent } from "./AddEditSlackSidebar";

const mapStateToProps = (state, props) => {
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
