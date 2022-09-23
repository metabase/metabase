// dev page, should NOT be shipped

import React from "react";
import { Link } from "react-router";
import _ from "underscore";
import { connect } from "react-redux";

import Actions from "metabase/entities/actions";
import type { WritebackQueryAction } from "metabase-types/api";

function ActionsListPage({ actions }: { actions: WritebackQueryAction[] }) {
  return (
    <div className="p4">
      <div className="flex justify-between">
        <h1>Actions</h1>
        <Link to="/action/create" className="Button Button--primary">
          Create Action
        </Link>
      </div>
      <div className="bordered rounded mt3">
        {actions
          ?.sort((a, b) => b.id - a.id)
          .map(action => (
            <ActionListItem action={action} key={action.id} />
          ))}
      </div>
    </div>
  );
}

const ActionListItem = ({ action }: { action: WritebackQueryAction }) => {
  return (
    <Link to={`/action/${action.id}`}>
      <div className="border-bottom p1" style={{}}>
        <strong>
          <span className="text-primary">{action.name}</span>
          <span className="text-light ml1">{action.id}</span>
        </strong>
        {!!action.description && (
          <div className="mt1">{action.description}</div>
        )}
      </div>
    </Link>
  );
};

export default _.compose(
  Actions.loadList(),
  connect(ActionsListPage),
)(ActionsListPage);
