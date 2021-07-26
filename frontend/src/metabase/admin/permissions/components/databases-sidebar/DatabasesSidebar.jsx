/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { Sidebar } from "../sidebar";
import { getDatabasesSidebar } from "./selectors";

const mapStateToProps = (state, props) => ({
  sidebar: getDatabasesSidebar(state, props),
});

const DatabasesSidebar = ({
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
        onSelect={onSelect}
        onEntityChange={onEntityChange}
        selectedId={parseInt(selectedId)}
      />
    </LoadingAndErrorWrapper>
  );
};

export default _.compose(
  connect(
    mapStateToProps,
    {
      onSelect: ({ id }) => push(`/admin/permissions/data/databases/${id}`),
      onEntityChange: entity => push(`/admin/permissions/data/${entity}`),
    },
  ),
)(DatabasesSidebar);
