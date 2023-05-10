import React, { useEffect } from "react";
import { connect } from "react-redux";
import { MetabotEntityId, MetabotEntityType } from "metabase-types/store";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import { init, InitPayload, reset } from "../../actions";
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
