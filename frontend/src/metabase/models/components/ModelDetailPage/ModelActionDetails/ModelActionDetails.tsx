import React from "react";

import Actions from "metabase/entities/actions";

import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/Question";

import ModelActionListItem from "./ModelActionListItem";

interface OwnProps {
  model: Question;
}

interface ActionsLoaderProps {
  actions: WritebackAction[];
}

type Props = OwnProps & ActionsLoaderProps;

function ModelActionDetails({ actions }: Props) {
  return (
    <ul>
      {actions.map(action => (
        <li key={action.id}>
          <ModelActionListItem action={action} />
        </li>
      ))}
    </ul>
  );
}

export default Actions.loadList({
  query: (state: State, { model }: OwnProps) => ({
    "model-id": model.id(),
  }),
})(ModelActionDetails);
