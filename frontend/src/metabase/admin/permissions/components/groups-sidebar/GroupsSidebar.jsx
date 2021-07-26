/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import Groups from "metabase/entities/groups";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { Sidebar } from "../sidebar";
import { getGroupsSidebar } from "./selectors";

const mapStateToProps = (state, props) => ({
  sidebar: getGroupsSidebar(state, props),
});

const GroupsSidebar = ({
  sidebar,
  onSelect,
  loading,
  onEntityChange,
  selectedId,
}) => {
  return (
    <LoadingAndErrorWrapper loading={loading}>
      <Sidebar
        {...sidebar}
        onEntityChange={onEntityChange}
        onSelect={onSelect}
        selectedId={parseInt(selectedId)}
      />
    </LoadingAndErrorWrapper>
  );
};

export default _.compose(
  Groups.loadList(),
  connect(
    mapStateToProps,
    {
      onSelect: ({ id }) => push(`/admin/permissions/data/groups/${id}`),
      onEntityChange: entity => push(`/admin/permissions/data/${entity}`),
    },
  ),
)(GroupsSidebar);
