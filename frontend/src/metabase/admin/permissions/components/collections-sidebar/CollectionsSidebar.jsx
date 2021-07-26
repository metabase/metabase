/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { push } from "react-router-redux";

import { Sidebar } from "../sidebar";
import { getCollectionsSidebar } from "./selectors";
import { getCollectionId } from "./utils";

const mapStateToProps = (state, props) => ({
  sidebar: getCollectionsSidebar(state, props),
});

const CollectionsSidebar = ({ sidebar, onSelect, selectedId }) => {
  return (
    <Sidebar
      {...sidebar}
      onSelect={onSelect}
      selectedId={getCollectionId(selectedId)}
    />
  );
};

export default _.compose(
  connect(
    mapStateToProps,
    {
      onSelect: ({ id }) => push(`/admin/permissions/collections/${id}`),
    },
  ),
)(CollectionsSidebar);
