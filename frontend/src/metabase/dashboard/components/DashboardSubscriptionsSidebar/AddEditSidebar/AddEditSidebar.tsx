import type { State } from "metabase/redux/store";
import { connect } from "metabase/utils/redux";

import { getParameters, getTabHiddenParameterSlugs } from "../../../selectors";

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
