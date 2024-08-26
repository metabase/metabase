import { useEffect } from "react";
import { connect } from "react-redux";

import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type { MetabotEntityId, MetabotEntityType } from "metabase-types/store";

import type { InitPayload } from "../../actions";
import { init, reset } from "../../actions";
import MetabotHeader from "../MetabotHeader";
import MetabotQueryBuilder from "../MetabotQueryBuilder";

import { MetabotRoot } from "./Metabot.styled";

interface OwnProps {
  entityId: MetabotEntityId;
  entityType: MetabotEntityType;
  initialPrompt?: string;
  model?: Question;
  database?: Database;
  databases?: Database[];
}

interface DispatchProps {
  onInit: (payload: InitPayload) => void;
  onReset: () => void;
}

type MetabotProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onInit: init,
  onReset: reset,
};

const Metabot = ({
  entityId,
  entityType,
  initialPrompt,
  model,
  database,
  databases,
  onInit,
  onReset,
}: MetabotProps) => {
  useEffect(() => {
    onInit({ entityId, entityType, initialPrompt });
    return () => onReset();
  }, [entityId, entityType, initialPrompt, onInit, onReset]);

  return (
    <MetabotRoot>
      <MetabotHeader model={model} database={database} databases={databases} />
      <MetabotQueryBuilder />
    </MetabotRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(Metabot);
