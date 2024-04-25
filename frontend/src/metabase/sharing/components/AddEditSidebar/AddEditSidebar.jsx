import { connect } from "react-redux";

import { getParameters } from "metabase/dashboard/selectors";

import _AddEditEmailSidebar from "./AddEditEmailSidebar";
import _AddEditSlackSidebar from "./AddEditSlackSidebar";

const mapStateToProps = (state, props) => {
  return {
    parameters: getParameters(state, props),
  };
};

export const AddEditEmailSidebar =
  connect(mapStateToProps)(_AddEditEmailSidebar);
export const AddEditSlackSidebar =
  connect(mapStateToProps)(_AddEditSlackSidebar);
