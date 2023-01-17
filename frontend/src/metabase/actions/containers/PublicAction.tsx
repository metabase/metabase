import React from "react";

import Actions from "metabase/entities/actions";
import * as Urls from "metabase/lib/urls";

import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { ActionForm } from "../components/ActionForm";

interface OwnProps {
  params: {
    slug: string;
  };
}

interface ActionEntityLoaderProps {
  action: WritebackAction;
}

type Props = OwnProps & ActionEntityLoaderProps;

function PublicAction({ action }: Props) {
  return (
    <>
      <h1>{action.name}</h1>
      <ActionForm parameters={action.parameters} />
    </>
  );
}

export default Actions.load({
  id: (state: State, { params }: OwnProps) => Urls.extractEntityId(params.slug),
})(PublicAction);
